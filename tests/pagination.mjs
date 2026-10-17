import test from "node:test";
import assert from "node:assert/strict";
import { paginationState } from "../src/utils/pagination.ts";

test("pagination handles boundaries, oversized page requests and smaller filtered collections", () => {
    const first = paginationState(27, 10);
    assert.deepEqual([first.previous, first.page, first.next, first.totalPages], [null, 1, 2, 3]);
    const middle = paginationState(27, 10, 2);
    assert.deepEqual([middle.previous, middle.page, middle.next, middle.start, middle.end], [1, 2, 3, 10, 20]);
    const last = paginationState(27, 10, 999);
    assert.deepEqual([last.previous, last.page, last.next, last.start, last.end], [2, 3, null, 20, 27]);
    const filtered = paginationState(2, 10, 3);
    assert.deepEqual([filtered.previous, filtered.page, filtered.next, filtered.totalPages], [null, 1, null, 1]);
    assert.equal(paginationState(0, 10).totalPages, 0);
    assert.equal(paginationState(27, 10, -5).page, 1);
    assert.throws(() => paginationState(27, 0), /positive integer/);
});
