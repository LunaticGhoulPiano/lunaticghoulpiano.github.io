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
import { getYoutubeContent } from "../../src/data/youtube/content.ts";
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
    assert.equal(requests, 6);
    assert.equal(calls.filter((call) => call.resource === "playlistItems").length, 2);
    assert.equal(calls.filter((call) => call.resource === "videos").length, 2);
    for (const call of calls) {
        assert.equal(call.parameters.key, fixtureKey);
        assert.equal(call.parameters.publishedAfter, undefined);
        assert.equal(call.parameters.videoDuration, undefined);
        assert.equal(call.parameters.eventType, undefined);
    }
    const feed = getYoutubeContent(snapshot);
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
    assert.equal(getYoutubeContent(null).notice, null);
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
        const playlistResponse = fixtureFetch({ count: 2, playlists: [{ id: "PL_failure", items: [1] }] });
        await assert.rejects(runYoutubeRefresh({
            key: fixtureKey,
            now: fixtureNow,
            outputDirectory: directory,
            request: (url, options) => new URL(url).searchParams.get("playlistId") === "PL_failure"
                ? Promise.resolve(new Response(null, { status: 503 })) : playlistResponse(url, options),
        }));
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

test("public owned playlists preserve positions and share video data without adding collaborators to uploads", async () => {
    const calls = [];
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
        count: 3,
        calls,
        playlists: [
            { id: "PL_first", title: "A & B", description: "First playlist", items: [2, 100, 0, 2] },
            { id: "PL_second", items: [100, 0] },
            { id: "PL_private", privacy: "private", items: [101] },
            { id: "PL_unlisted", privacy: "unlisted", items: [102] },
            { id: "PL_empty", items: [] },
        ],
        transform(resource, data, parameters) {
            if (resource === "playlistItems" && parameters.get("playlistId") !== "fixture_uploads") data.items.reverse();
            return data;
        },
    }));
    assert.deepEqual(snapshot.playlists.map((playlist) => playlist.id), ["PL_first", "PL_second", "PL_empty"]);
    assert.deepEqual(snapshot.playlists[0].items.map((item) => item.videoId), [2, 100, 0, 2].map(fixtureVideoId));
    assert.deepEqual(snapshot.playlists[0].items.map((item) => item.position), [0, 1, 2, 3]);
    assert.equal(snapshot.playlists[0].title, "A & B");
    assert.equal(snapshot.playlists[0].description, "First playlist");
    assert.equal(snapshot.videos.length, 4);
    const requestedIds = calls.filter((call) => call.resource === "videos").flatMap((call) => call.parameters.id.split(","));
    assert.equal(new Set(requestedIds).size, requestedIds.length);
    assert.deepEqual(new Set(requestedIds), new Set([0, 1, 2, 100].map(fixtureVideoId)));
    assert.ok(calls.filter((call) => call.resource === "playlistItems").every((call) => ! /private|unlisted/.test(call.parameters.playlistId)));
    const feed = getYoutubeContent(snapshot);
    assert.deepEqual(feed.videos.map((video) => video.id), [2, 1, 0].map(fixtureVideoId));
    assert.equal(feed.library.length, 4);
    assert.deepEqual(feed.playlists[2].items, []);
});

test("playlist catalogs and playlist contents both paginate without a fixed number of lists", async () => {
    const calls = [];
    const playlists = Array.from({ length: 51 }, (_, index) => ({
        id: `PL_${index}`,
        items: index === 50 ? Array.from({ length: 55 }, (_, position) => 54 - position) : [],
    }));
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({ count: 55, playlists, calls }));
    assert.equal(snapshot.playlists.length, playlists.length);
    assert.deepEqual(snapshot.playlists.at(-1).items.map((item) => item.videoId), playlists.at(-1).items.map(fixtureVideoId));
    assert.equal(calls.filter((call) => call.resource === "playlists").length, 2);
    assert.equal(calls.filter((call) => call.parameters.playlistId === "PL_50").length, 2);
    assert.equal(snapshot.videos.length, 55);
});

test("unavailable and nonpublic playlist videos leave no dangling references or private data", async () => {
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
        count: 1,
        playlists: [{ id: "PL_public", items: [0, 100, 101, 102, 103] }],
        transform(resource, data, parameters) {
            if (resource === "playlistItems" && parameters.get("playlistId") === "PL_public") {
                data.items[1].status.privacyStatus = "private";
                data.items[2].status.privacyStatus = "unlisted";
            }
            if (resource === "videos") {
                data.items = data.items.filter((video) => video.id !== fixtureVideoId(102));
                for (const video of data.items) {
                    if (video.id === fixtureVideoId(103)) video.status.privacyStatus = "private";
                }
            }
            return data;
        },
    }));
    assert.deepEqual(snapshot.videos.map((video) => video.id), [fixtureVideoId(0)]);
    assert.deepEqual(snapshot.playlists[0].items.map((item) => item.videoId), [fixtureVideoId(0)]);
    for (const index of [100, 101, 102, 103]) assert.equal(JSON.stringify(snapshot).includes(fixtureVideoId(index)), false);
});

test("playlist ownership, membership identity, order and pagination are validated", async () => {
    const transforms = [
        (resource, data) => {
            if (resource === "playlists") data.items[0].snippet.channelId = `UC${"b".repeat(22)}`;
        },
        (resource, data) => {
            if (resource === "playlists") data.items.push(data.items[0]);
        },
        (resource, data) => {
            if (resource === "playlists") data.nextPageToken = "repeat";
        },
        (_resource, data) => { data.items[0].snippet.playlistId = "PL_wrong"; },
        (_resource, data) => { data.items[1].snippet.position = data.items[0].snippet.position; },
        (_resource, data) => { data.items[1].id = data.items[0].id; },
    ];
    for (const [index, transform] of transforms.entries()) {
        await assert.rejects(fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
            count: 2,
            playlists: [{ id: "PL_owned", items: [1, 0] }],
            transform(resource, data, parameters) {
                if (index < 3 || (resource === "playlistItems" && parameters.get("playlistId") === "PL_owned")) transform(resource, data);
                return data;
            },
        })));
    }
});

test("snapshot validation rejects dangling references, duplicates, foreign uploads and foreign playlists", async () => {
    const { snapshot } = await fetchYoutubeSnapshot(fixtureKey, fixtureNow, fixtureFetch({
        count: 2,
        playlists: [{ id: "PL_owned", items: [1, 100] }],
    }));
    for (const mutate of [
        (data) => data.uploadedVideoIds.push(fixtureVideoId(100)),
        (data) => data.uploadedVideoIds.push(data.uploadedVideoIds[0]),
        (data) => { data.playlists[0].channelId = `UC${"b".repeat(22)}`; },
        (data) => { data.playlists[0].items[0].videoId = fixtureVideoId(999); },
        (data) => data.playlists.push(data.playlists[0]),
        (data) => data.playlists[0].items.reverse(),
        (data) => { data.playlists[0].items = []; },
    ]) {
        const changed = structuredClone(snapshot);
        mutate(changed);
        assert.equal(youtubeSnapshotSchema.safeParse(changed).success, false);
    }
});
