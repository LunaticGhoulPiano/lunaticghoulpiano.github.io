import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchYoutubeSnapshot } from "../../scripts/youtube/fetch.ts";
import { runYoutubeRefresh } from "../../scripts/youtube/update.mjs";
import { youtubePolicy } from "../../src/config/youtube.ts";
import { getYoutubeData } from "../../src/data/youtube/store.mjs";
import { youtubeSnapshotSchema } from "../../src/data/youtube/schema.ts";
import { displayDuration } from "../../src/utils/dates.ts";
import { getYoutubeFeed } from "../../src/services/feeds/youtube.ts";
import { readCredential } from "../../scripts/environment.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { fixtureFetch, fixtureKey, fixtureNow, fixtureVideoId } from "./fixture.mjs";

test("all uploads are paginated and batched, sorted by publication time, without date or format filters", async () => {
    const calls = [];
    const { snapshot, requests } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({ calls }));
    assert.equal(snapshot.videos.length, 57);
    assert.equal(snapshot.videos[0].id, fixtureVideoId(56));
    assert.equal(snapshot.videos.at(-1).id, fixtureVideoId(0));
    assert.equal(snapshot.channel.views, "9007199254740993");
    assert.equal(requests, 5);
    assert.equal(calls.filter((call) => call.resource === "playlistItems").length, 2);
    assert.equal(calls.filter((call) => call.resource === "videos").length, 2);
    for (const call of calls) {
        assert.equal(call.parameters.key, fixtureKey);
        assert.equal(call.parameters.publishedAfter, undefined);
        assert.equal(call.parameters.videoDuration, undefined);
        assert.equal(call.parameters.eventType, undefined);
    }
    const feed = getYoutubeFeed(snapshot);
    assert.equal(feed.videos.length, snapshot.videos.length);
    assert.equal(feed.notice.lastSuccessfulFetchAt, fixtureNow.toISOString());
    assert.equal(feed.period, null);
});

test("private, unlisted and unavailable videos are omitted, and hidden subscriber counts stay unknown", async () => {
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
        count: 6,
        transform(resource, data) {
            if (resource === "channels") {
                data.items[0].statistics.hiddenSubscriberCount = true;
            }
            if (resource === "videos") {
                data.items[0].status.privacyStatus = "private";
                data.items[1].status.privacyStatus = "unlisted";
                data.items.splice(2, 1);
            }
            return data;
        },
    }));
    assert.equal(snapshot.channel.subscribers, null);
    assert.deepEqual(snapshot.videos.map((video) => video.id), [5, 4, 3].map(fixtureVideoId));
});

test("video descriptions, durations and public statistics are preserved without inventing missing counts", async () => {
    const calls = [];
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
        count: 3,
        calls,
        transform(resource, data) {
            if (resource === "videos") {
                data.items[0].statistics = {};
                data.items[0].snippet.description = " \n ";
                data.items[0].contentDetails.duration = "PT0S";
                data.items[1].statistics.likeCount = "0";
                data.items[2].contentDetails.duration = "P1DT2H3M4S";
                delete data.items[2].snippet.description;
            }
            return data;
        },
    }));
    const [long, described, unavailable] = snapshot.videos;
    assert.equal(long.description, "");
    assert.equal(long.durationSeconds, 93784);
    assert.equal(displayDuration(long.durationSeconds), "26:03:04");
    assert.equal(long.views, "9007199254740993");
    assert.equal(described.description, "Description 1\nSecond line.");
    assert.equal(described.likes, "0");
    assert.equal(displayDuration(described.durationSeconds), "1:02:03");
    assert.equal(unavailable.description, "");
    assert.equal(unavailable.views, null);
    assert.equal(unavailable.likes, null);
    assert.equal(displayDuration(unavailable.durationSeconds), "0:00");
    assert.equal(displayDuration(65), "1:05");
    assert.ok(calls.filter((call) => call.resource === "videos").every((call) =>
        ["snippet", "contentDetails", "statistics"].every((part) => call.parameters.part.split(",").includes(part))));
    for (const duration of ["invalid", "PT", "P1DT", "PT-1S", "PT9007199254740992S"]) {
        await assert.rejects(fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
            count: 1,
            transform(resource, data) {
                if (resource === "videos") data.items[0].contentDetails.duration = duration;
                return data;
            },
        })));
    }
});

test("an empty channel remains valid without video detail requests", async () => {
    const calls = [];
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({ count: 0, calls }));
    assert.deepEqual(snapshot.videos, []);
    assert.equal(snapshot.channel.publicVideos, "0");
    assert.equal(calls.some((call) => call.resource === "videos"), false);
    assert.equal(getYoutubeFeed(null).notice, null);
});

test("invalid responses, repeated pagination, mismatched channels and unsafe images are rejected", async () => {
    const transforms = [
        (resource, data) => resource === "channels" ? { items: [] } : data,
        (resource, data) => resource === "channels" ? { items: [{}] } : data,
        (resource, data) => resource === "playlistItems" ? { ...data, nextPageToken: "repeat" } : data,
        (resource, data) => {
            if (resource === "videos") data.items[0].snippet.channelId = `UC${"b".repeat(22)}`;
            return data;
        },
        (resource, data) => {
            if (resource === "channels") data.items[0].snippet.thumbnails.medium.url = "https://example.org/track";
            return data;
        },
    ];
    for (const transform of transforms) {
        await assert.rejects(fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({ count: 4, transform })));
    }
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({ count: 1 }));
    snapshot.videos.push(snapshot.videos[0]);
    assert.equal(youtubeSnapshotSchema.safeParse(snapshot).success, false);
});

test("missing credentials make no requests and failures never expose the key", async () => {
    await assert.rejects(fetchYoutubeSnapshot("", fixtureNow, () => assert.fail("No request expected")), /Missing WEBPAGE_YOUTUBE_PROFILE_READONLY/);
    for (const request of [
        async () => { throw new Error(`Network failed: ${fixtureKey}`); },
        async () => Response.json({ error: { message: fixtureKey } }, { status: 403 }),
        async () => Response.json({ items: fixtureKey }),
    ]) {
        await assert.rejects(fetchYoutubeSnapshot(fixtureKey, fixtureNow, request), (error) => {
            assert.equal(String(error).includes(fixtureKey), false);
            return true;
        });
    }
});

test("updates save validated snapshots atomically and preserve previous data on failure", async () => {
    await withTemporaryDirectory(async (directory) => {
        await runYoutubeRefresh({ key: fixtureKey, now: fixtureNow, outputDirectory: directory, request: fixtureFetch({ count: 4 }) });
        const filename = join(directory, youtubePolicy.snapshotFilename);
        const previous = await readFile(filename, "utf8");
        assert.equal(getYoutubeData(directory).videos.length, 4);
        assert.equal(previous.includes(fixtureKey), false);
        await assert.rejects(runYoutubeRefresh({
            key: fixtureKey,
            now: fixtureNow,
            outputDirectory: directory,
            request: async () => new Response(null, { status: 403 }),
        }));
        assert.equal(await readFile(filename, "utf8"), previous);
        const response = fixtureFetch();
        let videoBatches = 0;
        await assert.rejects(runYoutubeRefresh({
            key: fixtureKey,
            now: fixtureNow,
            outputDirectory: directory,
            request: async (url, options) => {
                if (new URL(url).pathname.endsWith("/videos") && ++videoBatches === 2) {
                    return new Response(null, { status: 503 });
                }
                return response(url, options);
            },
        }));
        assert.equal(videoBatches, 2);
        assert.equal(await readFile(filename, "utf8"), previous);
        const wrongChannel = JSON.parse(previous);
        wrongChannel.handle = "@different_channel";
        await writeFile(filename, JSON.stringify(wrongChannel));
        assert.equal(getYoutubeData(directory), null);
    });
});

test("YouTube credentials use environment then local and base env files", async () => {
    await withTemporaryDirectory(async (directory) => {
        const name = "WEBPAGE_YOUTUBE_PROFILE_READONLY";
        assert.equal(readCredential(name, directory, {}), undefined);
        await writeFile(join(directory, ".env"), `${name}=fixture_base\n`);
        assert.equal(readCredential(name, directory, {}), "fixture_base");
        await writeFile(join(directory, ".env.local"), `${name}=fixture_local\n`);
        assert.equal(readCredential(name, directory, {}), "fixture_local");
        assert.equal(readCredential(name, directory, { [name]: fixtureKey }), fixtureKey);
    });
});
