import test from "node:test";
import assert from "node:assert/strict";
import { utcDayWindows, isWithinAge } from "../src/utils/dates.ts";

test("daily UTC windows retain partial boundary days across a leap day", () => {
    assert.deepEqual(utcDayWindows({
        from: "2024-02-29T07:00:00+08:00",
        to: "2024-03-01T00:00:00Z",
    }), [
        {
            date: "2024-02-28",
            from: "2024-02-28T23:00:00.000Z",
            to: "2024-02-28T23:59:59.999Z",
        },
        {
            date: "2024-02-29",
            from: "2024-02-29T00:00:00.000Z",
            to: "2024-02-29T23:59:59.999Z",
        },
        {
            date: "2024-03-01",
            from: "2024-03-01T00:00:00.000Z",
            to: "2024-03-01T00:00:00.000Z",
        },
    ]);
});

test("freshness excludes future, invalid and exactly expired timestamps", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    assert.equal(isWithinAge(new Date(now).toISOString(), now, 1000), true);
    assert.equal(isWithinAge(new Date(now - 999).toISOString(), now, 1000), true);
    assert.equal(isWithinAge(new Date(now - 1000).toISOString(), now, 1000), false);
    assert.equal(isWithinAge(new Date(now + 1).toISOString(), now, 1000), false);
    assert.equal(isWithinAge("invalid", now, 1000), false);
});
