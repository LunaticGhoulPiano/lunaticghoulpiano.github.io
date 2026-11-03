import assert from "node:assert/strict";
import { test } from "node:test";
import { brickGeometry } from "../src/scripts/glass/brick.js";
import { lightOnGlass } from "../src/scripts/glass/lighting.js";

test("a larger panel keeps the same physical bevel and a clear face", () => {
    for (const [width, height] of [[190, 320], [400, 700], [1200, 90]]) {
        assert.equal(brickGeometry(width, height, [8, 8, 8, 8], 9).bevel, 9);
    }
    const small = brickGeometry(16, 16, [12, 12, 0, 0], 9);
    assert.deepEqual(small.corners, [8, 8, 0, 0]);
    assert.ok(small.bevel < 8);
});

test("the same pointer lights opposite edges of separate surfaces and attenuates with distance", () => {
    const left = { left: 20, top: 30, width: 80, height: 40 };
    const right = { ...left, left: 260 };
    const near = lightOnGlass(left, 110, 50);
    const far = lightOnGlass(right, 110, 50);
    assert.equal(near.angle, 0);
    assert.equal(far.angle, Math.PI);
    assert.equal(near.x, 80);
    assert.equal(far.x, 0);
    assert.ok(near.power > far.power);
});
