import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchMymusic5Snapshot } from "../../scripts/mymusic5/fetch.ts";
import { runMymusic5Refresh } from "../../scripts/mymusic5/update.mjs";
import { mymusic5Artist, mymusic5Policy, mymusic5Url } from "../../src/config/mymusic5.ts";
import { getMymusic5Data } from "../../src/data/mymusic5/store.mjs";
import { mymusic5SnapshotSchema } from "../../src/data/mymusic5/schema.ts";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { fixtureFetch, fixtureNow } from "./fixture.mjs";

test("all public sheets are paginated, paid and free entries preserved, and authors stored once", async () => {
    const calls = [];
    const { snapshot, requests } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({ calls }));
    assert.equal(requests, 26);
    assert.equal(snapshot.sheets.length, 23);
    assert.equal(snapshot.sheets[0].sheetId, 23);
    assert.equal(snapshot.sheets.at(-1).sheetId, 1);
    assert.equal(snapshot.sheets.filter((sheet) => sheet.price > 0).length, 22);
    assert.equal(snapshot.sheets.filter((sheet) => sheet.isFree).length, 1);
    assert.ok(snapshot.sheets.every((sheet) => ! ("author" in sheet) && ! ("files" in sheet) && ! ("futureField" in sheet)));
    assert.equal(snapshot.author.name, "Artist & Arranger");
    assert.deepEqual(Object.keys(snapshot.author).sort(), ["artistUrl", "name", "profileUrl"]);
    assert.equal(snapshot.sheets[0].metaSong, "Song 'One'");
    assert.equal(snapshot.sheets[0].description, "Notes & chords");
    const pages = calls.filter(({ options }) => options.method === "POST");
    const details = calls.filter(({ options }) => options.method === "GET");
    assert.equal(pages.length, 3);
    assert.equal(details.length, 23);
    for (const { body } of pages) {
        assert.equal(body.variables.data.isFree, null);
        assert.equal(body.variables.data.artistUrl, mymusic5Artist.artistUrl);
    }
    assert.equal(mymusic5Url(snapshot.author.artistUrl, 380535), "https://www.mymusic5.com/lunaticghoulpiano/380535");
    assert.equal(mymusic5Url(snapshot.author.artistUrl), "https://www.mymusic5.com/lunaticghoulpiano");
});

test("empty catalogs and exact page boundaries terminate without extra page requests", async () => {
    for (const count of [0, 10, 20]) {
        const { snapshot, requests } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({ count }));
        assert.equal(snapshot.sheets.length, count);
        assert.equal(requests, count + Math.max(1, count / 10));
        if (count === 0) assert.equal(snapshot.author, null);
    }
});

test("incomplete, repeated, changing and foreign catalog data are rejected", async () => {
    const cases = [
        (_page, data) => { data.data.sheetSearch.list.pop(); },
        (page, data) => { if (page === 2) data.data.sheetSearch.current = 1; },
        (page, data) => { if (page === 2) data.data.sheetSearch.total++; },
        (page, data) => { if (page === 2) data.data.sheetSearch.list[0].sheetId = 1; },
        (_page, data) => { data.data.sheetSearch.list[0].author.artistUrl = "another-artist"; },
        (_page, data) => { data.errors = [{ message: "Partial query failure" }]; },
    ];
    for (const mutate of cases) {
        await assert.rejects(fetchMymusic5Snapshot(fixtureNow, fixtureFetch({
            transform(page, data) {
                mutate(page, data);
                return data;
            },
        })));
    }
});

test("full API details retain the existing snapshot fields, normalization and ordering", async () => {
    const { snapshot } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({ count: 2 }));
    assert.deepEqual(snapshot.sheets.at(-1), {
        sheetId: 1,
        title: "Song & Artist",
        description: "Notes & chords",
        metaSong: "Song 'One'",
        metaMusician: "Composer",
        metaMaker: "Arranger",
        thumbnailUrl: "https://img.musicfive.com/score.webp",
        youtubeId: "5CinWpLxyAY",
        instruments: ["piano-88keys"],
        level: 2,
        instrumentation: "solo",
        sheetType: "2staves",
        includeChord: false,
        includeLyrics: false,
        price: 0,
        currency: "USD",
        isFree: true,
        status: "ON_SALE",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: fixtureNow.toISOString(),
        likes: 0,
    });
    assert.equal(snapshot.schemaVersion, mymusic5Policy.schemaVersion);
    assert.equal(snapshot.lastSuccessfulFetchAt, fixtureNow.toISOString());
    assert.deepEqual(snapshot.sheets.map((sheet) => sheet.sheetId), [2, 1]);
});

test("UTC detail timestamps and explicit offsets produce the same snapshot dates", async () => {
    for (const createdAt of ["2026-01-01T00:00:00", "2026-01-01T00:00:00Z", "2026-01-01T08:00:00+08:00"]) {
        const { snapshot } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({
            count: 1,
            transformSheet: (sheet) => ({ ...sheet, createdAt }),
        }));
        assert.equal(snapshot.sheets[0].createdAt, "2026-01-01T00:00:00.000Z");
    }
});

test("website-specific validation still rejects invalid complete API details", async () => {
    for (const invalid of [
        { thumbnailUrl: "https://example.com/image.webp" },
        { status: "PRIVATE" },
        { updatedAt: "2020-01-01T00:00:00" },
        { createdAt: "2026-02-30T12:00:00" },
        { createdAt: null },
        { author: { artistUrl: mymusic5Artist.artistUrl } },
    ]) {
        await assert.rejects(fetchMymusic5Snapshot(fixtureNow, fixtureFetch({
            count: 1,
            transformSheet: (sheet) => ({ ...sheet, ...invalid }),
        })));
    }
});

test("network and response failures preserve the previously saved snapshot", async () => {
    await withTemporaryDirectory(async (directory) => {
        await runMymusic5Refresh({ outputDirectory: directory, now: fixtureNow, request: fixtureFetch({ count: 2 }) });
        const path = join(directory, mymusic5Policy.snapshotFilename);
        const previous = await readFile(path, "utf8");
        assert.equal(getMymusic5Data(directory).sheets.length, 2);
        for (const request of [
            async () => { throw new Error("Connection failed"); },
            async () => new Response("Rate limited", { status: 429 }),
            fixtureFetch({ transform: () => ({ data: null, errors: [{ message: "Failure" }] }) }),
            fixtureFetch({ transform: (page, data) => { if (page === 2) data.data.sheetSearch.list = []; return data; } }),
            fixtureFetch({ transformSheet: (sheet) => ({ ...sheet, thumbnailUrl: "https://example.com/image.webp" }) }),
            fixtureFetch({ transformSheet: (sheet) => ({ ...sheet, author: { artistUrl: "another-artist" } }) }),
            async (url, options) => options.method === "GET"
                ? new Response("Not found", { status: 404 })
                : fixtureFetch({ count: 2 })(url, options),
        ]) {
            await assert.rejects(runMymusic5Refresh({ outputDirectory: directory, now: fixtureNow, request }));
            assert.equal(await readFile(path, "utf8"), previous);
        }
        const invalid = JSON.parse(previous);
        invalid.sheets.push(invalid.sheets[0]);
        assert.equal(mymusic5SnapshotSchema.safeParse(invalid).success, false);
        invalid.sheets.pop();
        invalid.artistUrl = "another-artist";
        invalid.author.artistUrl = "another-artist";
        await writeFile(path, JSON.stringify(invalid));
        assert.equal(getMymusic5Data(directory), null);
    });
});
