import test from "node:test";
import assert from "node:assert/strict";
import { installGlobals } from "./fixture.mjs";
import { initializeTimelines, timelineItemPresentation } from "../src/scripts/timeline.ts";

test("timeline bends right at both ends, with the largest items in the center", () => {
    const top = timelineItemPresentation(0, 100, 500, 50);
    const center = timelineItemPresentation(200, 100, 500, 50);
    const bottom = timelineItemPresentation(400, 100, 500, 50);
    assert.deepEqual(top, bottom);
    assert.equal(center.x, 0);
    assert.equal(center.scale, 1);
    assert.ok(top.x > center.x);
    assert.ok(top.scale < center.scale);
    assert.equal(timelineItemPresentation(-50, 100, 500, 50).scale, 0.8);
    assert.equal(top.opacity, 1, "fully visible first and last entries remain readable");
});

test("entries fade at either edge and recover when scrolled back, including tall entries", () => {
    const samples = [-100, -75, -50, -25, 0].map((top) => timelineItemPresentation(top, 100, 500, 50).opacity);
    assert.deepEqual(samples, [0, 0.15625, 0.5, 0.84375, 1]);
    assert.deepEqual([500, 475, 450, 425, 400].map((top) => timelineItemPresentation(top, 100, 500, 50).opacity), samples);
    assert.equal(timelineItemPresentation(-100, 800, 500, 50).opacity, 1);
    assert.deepEqual(timelineItemPresentation(0, 0, 0, 50), { x: 0, scale: 1, opacity: 1 });
});

function element(properties = {}) {
    const node = Object.assign(new EventTarget(), {
        dataset: {},
        style: { setProperty(key, value) { this[key] = value; } },
        hidden: false,
        disabled: false,
        attributes: new Set(),
        toggleAttribute(name, enabled) { enabled ? this.attributes.add(name) : this.attributes.delete(name); },
        // Transformed rectangles must not feed back into layout measurements.
        getBoundingClientRect() { throw new Error("Do not measure transformed bounds"); },
    }, properties);
    return node;
}

function fixture(context, { touch = false, count = 8, fixedHeight = "400" } = {}) {
    const frames = new Map();
    let sequence = 0;
    let now = 0;
    let resize;
    const motion = element({ matches: false });
    const input = element({ matches: touch });
    const items = Array.from({ length: count }, (_, index) => element({ offsetTop: 16 + index * 100, offsetHeight: 100 }));
    const list = element({ children: items, offsetTop: 0, keyboardFocus: null,
        querySelector(selector) { assert.equal(selector, ":focus-visible"); return this.keyboardFocus; },
    });
    const viewport = element({
        clientWidth: 350, offsetWidth: 356, scrollTop: 0,
        scrollHeight: count * 100 + 32,
        querySelector: () => list,
        scrollTo({ top, behavior }) {
            assert.equal(behavior, "instant");
            this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
            this.dispatchEvent(new Event("scroll"));
        },
    });
    Object.defineProperty(viewport, "clientHeight", { get: () => Number.parseFloat(viewport.style.height) || 400 });
    const newest = element();
    const oldest = element();
    const nodes = { scroll: viewport, newest, oldest };
    const root = element({
        dataset: { visibleItems: "3", height: fixedHeight },
        querySelector: (selector) => nodes[selector.slice("[data-timeline-".length, -1)],
    });
    const observed = [];
    installGlobals(context, {
        document: { querySelectorAll: () => [root] },
        window: { matchMedia: (query) => query === "(prefers-reduced-motion: reduce)" ? motion : input },
        getComputedStyle: () => ({ paddingBottom: "16px" }),
        requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); },
        ResizeObserver: class {
            constructor(callback) { resize = callback; }
            observe(node) { observed.push(node); }
        },
    });
    function frame(elapsed = 0) {
        now += elapsed;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(now));
    }
    initializeTimelines();
    frame();
    return {
        root, viewport, list, items, newest, oldest, motion, input, observed, frame,
        finish() { frame(); frame(560); frame(); },
        resize: () => { resize(); frame(); },
        scroll(top) { viewport.scrollTo({ top, behavior: "instant" }); frame(); },
        opacity: (index) => Number(items[index].style["--timeline-opacity"]),
        selected: () => items.flatMap((item, index) => item.attributes.has("data-visual-focus") ? [index] : []),
        pending: () => frames.size,
    };
}

test("scroll, jump controls and reduced-motion changes keep entries visible without a permanent animation loop", (context) => {
    const view = fixture(context);
    assert.equal(view.opacity(0), 1);
    assert.equal(view.opacity(7), 0);
    assert.equal(view.newest.disabled, true);
    assert.equal(view.oldest.disabled, false);
    view.scroll(66);
    assert.equal(view.opacity(0), 0.5);
    view.scroll(0);
    assert.equal(view.opacity(0), 1);
    view.oldest.dispatchEvent(new Event("click"));
    view.finish();
    assert.equal(view.opacity(7), 1);
    assert.equal(view.oldest.disabled, true);
    view.motion.matches = true;
    view.motion.dispatchEvent(new Event("change"));
    view.frame();
    for (const item of view.items) {
        assert.equal(item.style["--timeline-opacity"], "1");
        assert.equal(item.style["--timeline-scale"], "1");
        assert.equal(item.style["--timeline-x"], "0.00px");
    }
    view.motion.matches = false;
    view.motion.dispatchEvent(new Event("change"));
    view.frame();
    assert.equal(view.opacity(0), 0);
    assert.equal(view.opacity(7), 1);
    assert.equal(view.pending(), 0);
});

test("resize measures untransformed rows, supports initially hidden sources and remains stable", (context) => {
    const view = fixture(context, { fixedHeight: "" });
    assert.equal(view.viewport.style.height, "332px");
    view.resize();
    assert.equal(view.viewport.style.height, "332px");
    view.viewport.clientWidth = 0;
    view.resize();
    view.viewport.clientWidth = 250;
    view.resize();
    assert.equal(view.root.style["--timeline-arc-width"], "30px");
    assert.ok(view.observed.includes(view.viewport));
    assert.ok(view.observed.includes(view.list));
});

test("all timelines receive arc styles without an opt-in, including short project lists", (context) => {
    const view = fixture(context, { count: 2 });
    assert.equal(view.newest.hidden, true);
    assert.equal(view.oldest.hidden, true);
    assert.equal(view.pending(), 0);
    assert.ok(Number.parseFloat(view.items[0].style["--timeline-x"]) > 0);
    assert.equal(view.opacity(0), 1);
    assert.deepEqual(view.selected(), [], "a mouse does not enable automatic selection");
});

test("touch selects just the nearest visible row and follows scrolling in either direction", (context) => {
    const view = fixture(context, { touch: true });
    assert.deepEqual(view.selected(), [1]);
    view.scroll(116);
    assert.deepEqual(view.selected(), [2]);
    view.scroll(0);
    assert.deepEqual(view.selected(), [1]);
    view.oldest.dispatchEvent(new Event("click"));
    view.finish();
    assert.deepEqual(view.selected(), [6]);
    view.input.matches = false;
    view.input.dispatchEvent(new Event("change"));
    view.frame();
    assert.deepEqual(view.selected(), []);
    view.input.matches = true;
    view.input.dispatchEvent(new Event("change"));
    view.frame();
    assert.deepEqual(view.selected(), [6]);
    assert.equal(view.pending(), 0);
});

test("timeline jump movement eases, reverses from its current position and stops for touch input", (context) => {
    const view = fixture(context, { touch: true });
    view.oldest.dispatchEvent(new Event("click"));
    view.frame();
    view.frame(280);
    const middle = view.viewport.scrollTop;
    assert.ok(middle > 0 && middle < view.viewport.scrollHeight - view.viewport.clientHeight);
    view.newest.dispatchEvent(new Event("click"));
    view.frame();
    view.frame(280);
    assert.ok(view.viewport.scrollTop < middle);
    view.viewport.dispatchEvent(new Event("touchstart"));
    const stopped = view.viewport.scrollTop;
    view.finish();
    assert.equal(view.viewport.scrollTop, stopped);
    assert.equal(view.pending(), 0);
});

test("filtering, reordering, empty results and hidden timelines cannot leave stale touch selection", (context) => {
    const view = fixture(context, { touch: true });
    view.items[1].hidden = true;
    view.root.dispatchEvent(new Event("timeline:change"));
    view.frame();
    assert.deepEqual(view.selected(), [2]);
    view.items[0].offsetTop = 116;
    view.items[2].offsetTop = 16;
    view.root.dispatchEvent(new Event("timeline:change"));
    view.frame();
    assert.deepEqual(view.selected(), [0]);
    view.viewport.clientWidth = 0;
    view.resize();
    assert.deepEqual(view.selected(), []);
    view.viewport.clientWidth = 350;
    view.resize();
    assert.deepEqual(view.selected(), [0]);
    view.items.forEach((item) => { item.hidden = true; });
    view.root.dispatchEvent(new Event("timeline:change"));
    view.frame();
    assert.deepEqual(view.selected(), []);
});

test("keyboard focus takes precedence on touch devices; reduced motion keeps selection without motion", (context) => {
    const view = fixture(context, { touch: true });
    view.list.keyboardFocus = view.items[0];
    view.viewport.dispatchEvent(new Event("focusin"));
    view.frame();
    assert.deepEqual(view.selected(), []);
    assert.equal(view.list.keyboardFocus, view.items[0]);
    view.list.keyboardFocus = null;
    view.viewport.dispatchEvent(new Event("focusout"));
    view.frame();
    assert.deepEqual(view.selected(), [1]);
    view.motion.matches = true;
    view.motion.dispatchEvent(new Event("change"));
    view.frame();
    assert.deepEqual(view.selected(), [1]);
    assert.equal(view.items[1].style["--timeline-scale"], "1");
    assert.equal(view.items[1].style["--timeline-x"], "0.00px");
    assert.equal(view.list.keyboardFocus, null);
});
