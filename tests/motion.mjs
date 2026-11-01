import test from "node:test";
import assert from "node:assert/strict";
import { installGlobals } from "./fixture.mjs";
import { createMotion, revealItems } from "../src/scripts/motion.ts";

function fixture(context, reduced = false) {
    const frames = new Map();
    let id = 0;
    const preference = Object.assign(new EventTarget(), { matches: reduced });
    installGlobals(context, {
        window: { matchMedia: () => preference },
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
        cancelAnimationFrame(key) { frames.delete(key); },
    });
    return {
        motion: createMotion(), preference,
        frame(now) { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now)); },
        pending: () => frames.size,
    };
}

test("shared movement accelerates then decelerates, reaches its endpoint and stops scheduling", (context) => {
    const view = fixture(context);
    const values = [];
    let cleaned = 0;
    view.motion.run((value) => values.push(value), () => cleaned++, 400);
    for (const time of [0, 100, 200, 300, 400]) view.frame(time);
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 1);
    const [, start, quarter, middle, later, end] = values;
    assert.ok(middle - quarter > quarter - start);
    assert.ok(later - middle > end - later);
    assert.equal(cleaned, 1);
    assert.equal(view.motion.active, false);
    assert.equal(view.pending(), 0);
});

test("replacement and manual interruption cancel stale frames and clean up once", (context) => {
    const view = fixture(context);
    const first = [], second = [];
    let cleaned = 0;
    view.motion.run((value) => first.push(value), () => cleaned++);
    view.frame(0);
    view.frame(100);
    const count = first.length;
    view.motion.run((value) => second.push(value), () => cleaned++);
    assert.equal(cleaned, 1);
    view.frame(200);
    view.motion.cancel();
    view.motion.cancel();
    view.frame(1000);
    assert.equal(first.length, count);
    assert.equal(cleaned, 2);
    assert.equal(view.pending(), 0);
    assert.notEqual(second.at(-1), 1, "cancellation stops where the user interrupted it");
});

test("reduced motion applies the destination immediately, including a preference change mid-animation", (context) => {
    const view = fixture(context, true);
    const values = [];
    view.motion.run((value) => values.push(value));
    assert.deepEqual(values, [1]);
    assert.equal(view.pending(), 0);
    view.preference.matches = false;
    view.motion.run((value) => values.push(value));
    view.frame(0);
    view.preference.matches = true;
    view.preference.dispatchEvent(new Event("change"));
    assert.equal(values.at(-1), 1);
    assert.equal(view.pending(), 0);
    assert.equal(view.motion.active, false);
});

function entranceItem() {
    let finish;
    let reject;
    return {
        attributes: new Set(), animations: [],
        setAttribute(name) { this.attributes.add(name); },
        removeAttribute(name) { this.attributes.delete(name); },
        animate(frames, options) {
            const animation = {
                frames, options,
                finished: new Promise((done, fail) => { finish = done; reject = fail; }),
                cancel() { reject(new Error("cancelled")); },
            };
            this.animations.push(animation);
            return animation;
        },
        finish() { finish(); },
    };
}

test("entrance staggers whole items with a bounded delay and leaves no styles or markers", async (context) => {
    fixture(context);
    const items = Array.from({ length: 8 }, entranceItem);
    const entering = revealItems(items, new AbortController().signal, 270);
    const delays = items.map((item) => item.animations[0].options.delay);
    assert.equal(delays[0], 0);
    assert.ok(delays[1] > 0 && delays[1] <= 45);
    assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]));
    assert.equal(delays.at(-1), 270);
    for (const item of items) {
        assert.equal(item.animations[0].frames[0].transform, undefined);
        assert.equal(item.animations[0].frames[0].opacity, undefined);
        item.finish();
    }
    await entering;
    assert.ok(items.every((item) => item.attributes.size === 0));
});

test("aborted entrances and changing reduced motion reveal all pending items immediately", async (context) => {
    const view = fixture(context);
    for (const reason of ["abort", "preference"]) {
        const controller = new AbortController();
        const items = [entranceItem(), entranceItem()];
        const entering = revealItems(items, controller.signal);
        if (reason === "abort") controller.abort();
        else {
            view.preference.matches = true;
            view.preference.dispatchEvent(new Event("change"));
        }
        await entering;
        assert.ok(items.every((item) => item.attributes.size === 0));
    }
    const item = entranceItem();
    await revealItems([item], new AbortController().signal);
    assert.equal(item.animations.length, 0, "Reduced motion never starts an entrance.");
    assert.equal(item.attributes.size, 0);
});
