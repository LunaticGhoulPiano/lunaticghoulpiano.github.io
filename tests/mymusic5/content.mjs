import test from "node:test";
import assert from "node:assert/strict";
import { getMymusic5Content } from "../../src/data/mymusic5/content.ts";
import { fetchMymusic5Snapshot } from "../../scripts/mymusic5/fetch.ts";
import { fixtureFetch, fixtureNow } from "./fixture.mjs";

test("MyMusic5 content orders by upload date without changing the saved catalog or excluding paid sheets", async () => {
    const { snapshot } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({
        count: 3,
        transformSheet: (sheet) => ({
            ...sheet,
            createdAt: sheet.sheetId === 3 ? "2026-01-02T00:00:00" : sheet.createdAt,
            updatedAt: sheet.sheetId === 1 ? fixtureNow.toISOString() : "2026-02-01T00:00:00",
        }),
    }));
    snapshot.sheets.reverse();
    const original = structuredClone(snapshot);
    const data = getMymusic5Content(snapshot);
    assert.deepEqual(data.sheets.map((sheet) => sheet.sheetId), [3, 2, 1]);
    assert.equal(data.sheets.filter((sheet) => ! sheet.isFree).length, 2);
    assert.deepEqual(snapshot, original);
    assert.deepEqual(data.author, snapshot.author);
    assert.equal(data.notice.lastSuccessfulFetchAt, snapshot.lastSuccessfulFetchAt);
});

test("MyMusic5 content distinguishes an empty public catalog from a missing snapshot", async () => {
    const { snapshot } = await fetchMymusic5Snapshot(fixtureNow, fixtureFetch({ count: 0 }));
    const empty = getMymusic5Content(snapshot);
    const missing = getMymusic5Content(null);
    assert.deepEqual(empty.sheets, []);
    assert.equal(empty.author, null);
    assert.equal(empty.notice.lastSuccessfulFetchAt, fixtureNow.toISOString());
    assert.deepEqual(missing, { period: null, notice: null, author: null, sheets: [] });
});
