import test from "node:test";
import assert from "node:assert/strict";
import { installGlobals, contentTransitionFixture } from "./fixture.mjs";
import { createMotion, createContentTransition, revealItems } from "../src/scripts/motion.ts";

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

test("content switches preserve direction, fade through the swap, and release styles and focus state", (context) => {
    const view = contentTransitionFixture(false);
    installGlobals(context, view.environment);
    const transition = createContentTransition(view.root);
    let changes = 0;
    transition.run(() => changes++, -1);
    view.frame(0);
    view.frame(140);
    assert.ok(Number.parseFloat(view.body.style.translate) > 0);
    assert.equal(changes, 0);
    assert.equal(view.body.inert, true);
    view.frame(280);
    assert.equal(changes, 1);
    assert.equal(view.body.style.opacity, "0");
    view.frame(420);
    assert.ok(Number.parseFloat(view.body.style.translate) < 0);
    view.frame(560);
    assert.equal(changes, 1);
    assert.equal(view.body.inert, false);
    assert.equal(view.body.style.translate, undefined);
    assert.equal(view.body.style.opacity, undefined);
    assert.equal(view.root.style.minHeight, undefined);
    assert.equal(view.root.attributes.size, 0);
    assert.equal(view.pending(), 0);
});

test("content transitions respect reduced motion and finish on manual interaction without replay", (context) => {
    const view = contentTransitionFixture(true);
    installGlobals(context, view.environment);
    const transition = createContentTransition(view.root);
    const changes = [];
    transition.run(() => changes.push("immediate"));
    assert.deepEqual(changes, ["immediate"]);
    assert.equal(view.pending(), 0);
    view.preference.matches = false;
    transition.run(() => changes.push("interrupted"));
    view.root.dispatchEvent(new Event("wheel"));
    view.frame(1000);
    assert.deepEqual(changes, ["immediate", "interrupted"]);
    assert.equal(view.body.inert, false);
    transition.run(() => changes.push("preference changed"));
    view.preference.matches = true;
    view.preference.dispatchEvent(new Event("change"));
    assert.equal(changes.at(-1), "preference changed");
    assert.equal(view.pending(), 0);
});

function entranceItem() {
    let finish;
    let reject;
    return {
        attributes: new Set(), animations: [], dataset: {},
        setAttribute(name) { this.attributes.add(name); },
        removeAttribute(name) { this.attributes.delete(name); },
        animate(frames, options) {
            const animation = {
                frames, options, playState: "running",
                pause() { this.playState = "paused"; },
                play() { this.playState = "running"; },
                finished: new Promise((done, fail) => { finish = done; reject = fail; }),
                cancel() { this.playState = "idle"; reject(new Error("cancelled")); },
            };
            this.animations.push(animation);
            return animation;
        },
        finish() { finish(); },
    };
}

test("entrance staggers whole items with a bounded delay and leaves no styles or markers", async (context) => {
    const view = fixture(context);
    const items = Array.from({ length: 8 }, entranceItem);
    const controls = [entranceItem(), entranceItem()];
    controls[1].dataset.revealEffect = "gutter";
    const entering = revealItems(items, new AbortController().signal, 270, controls);
    const group = [...items, ...controls].map((item) => item.animations[0]);
    assert.ok(group.every((animation) => animation.playState === "paused" && animation.currentTime === 0));
    assert.equal(view.pending(), 1, "one shared start frame, regardless of the number of rows");
    view.frame(100);
    assert.ok(group.every((animation) => animation.playState === "paused"), "the initial layout gets its own paint");
    view.frame(117);
    assert.ok(group.every((animation) => animation.playState === "running"));
    const delays = items.map((item) => item.animations[0].options.delay);
    assert.equal(delays[0], 0);
    assert.ok(delays[1] > 0 && delays[1] <= 45);
    assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]));
    assert.equal(delays.at(-1), 270);
    for (const control of controls) {
        const { delay, duration, fill } = control.animations[0].options;
        assert.equal(delay, delays.at(-1) + delays[1]);
        assert.ok(delay < delays.at(-1) + duration, "controls enter while the last row is still moving");
        assert.equal(fill, "backwards", "delayed controls are concealed from the first frame");
    }
    for (const item of [...items, controls[0]]) {
        assert.equal(item.animations[0].frames[0].transform, undefined);
        assert.equal(item.animations[0].frames[0].opacity, 0);
        assert.equal(item.animations[0].frames[1].opacity, undefined, "finish at the row's underlying opacity");
    }
    assert.equal(controls[1].animations[0].frames[0].opacity, undefined, "revealing the gutter never hides its content");
    for (const item of [...items, ...controls]) item.finish();
    await entering;
    assert.ok([...items, ...controls].every((item) => item.attributes.size === 0));
});

test("aborted entrances and changing reduced motion reveal all pending items immediately", async (context) => {
    const view = fixture(context);
    for (const reason of ["abort", "preference"]) {
        const controller = new AbortController();
        const items = [entranceItem(), entranceItem()];
        const control = entranceItem();
        const entering = revealItems(items, controller.signal, 270, [control]);
        if (reason === "abort") controller.abort();
        else {
            view.preference.matches = true;
            view.preference.dispatchEvent(new Event("change"));
        }
        await entering;
        assert.equal(view.pending(), 0, "cancelling before first paint must not restart the group");
        assert.ok(items.every((item) => item.attributes.size === 0));
        assert.equal(control.attributes.size, 0);
    }
    const item = entranceItem();
    await revealItems([item], new AbortController().signal);
    assert.equal(item.animations.length, 0, "Reduced motion never starts an entrance.");
    assert.equal(item.attributes.size, 0);
});
