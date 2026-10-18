import test from "node:test";
import assert from "node:assert/strict";
import { initializePageTurners } from "../src/scripts/page_turner.ts";
import { pageTurnInterval, pageTurnDuration } from "../src/config/collections.ts";

function element() {
    const attributes = new Map();
    return Object.assign(new EventTarget(), {
        dataset: {},
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: (name) => attributes.get(name) ?? null,
        removeAttribute: (name) => attributes.delete(name),
        toggleAttribute(name, enabled) {
            if (enabled) attributes.set(name, "");
            else attributes.delete(name);
        },
    });
}

function fixture(context, { names = ["Page A", "Page B", "Page C"], reduced = false, hovered = false } = {}) {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const pages = names.map((name) => {
        const page = element();
        page.setAttribute("aria-label", name);
        page.scrollTop = 120;
        return page;
    });
    const nodes = Object.fromEntries(["controls", "previous", "next", "position"].map((key) => [key, element()]));
    nodes.pages = { children: pages };
    const root = Object.assign(element(), {
        dataset: { interval: String(pageTurnInterval) },
        matches: () => hovered,
        contains: (target) => target != null && (pages.includes(target) || Object.values(nodes).includes(target)),
        querySelector: (selector) => nodes[selector.slice("[data-page-turner-".length, -1)],
    });
    const document = Object.assign(element(), {
        hidden: false,
        activeElement: null,
        querySelectorAll: () => [root],
    });
    const motion = Object.assign(element(), { matches: reduced });
    const window = Object.assign(element(), { matchMedia: () => motion });
    const environment = {
        document,
        window,
    };
    for (const [key, value] of Object.entries(environment)) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { configurable: true, value });
        context.after(() => {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        });
    }
    initializePageTurners();
    return {
        ...nodes,
        root,
        document,
        window,
        motion,
        pages,
        current: () => pages.findIndex((page) => page.getAttribute("data-current") !== null),
        tick: () => context.mock.timers.tick(pageTurnInterval),
        dispatch(target, type, properties = {}) {
            target.dispatchEvent(Object.assign(new Event(type), properties));
        },
    };
}

test("automatic pages cycle through every source and retain existing timeline nodes", (context) => {
    const view = fixture(context);
    assert.equal(view.current(), 0);
    for (const expected of [1, 2, 0, 1, 2, 0]) {
        view.tick();
        assert.equal(view.current(), expected);
        view.pages.forEach((page, index) => {
            assert.equal(page.inert, index !== expected);
            assert.equal(page.getAttribute("aria-hidden"), String(index !== expected));
            assert.equal(page.scrollTop, 120);
        });
    }
    assert.equal(view.position.getAttribute("aria-live"), "off");
});

test("only hover pauses paging and departure starts a full interval even with keyboard focus", (context) => {
    const view = fixture(context, { hovered: true });
    view.tick();
    assert.equal(view.current(), 0);
    view.dispatch(view.root, "mouseleave");
    context.mock.timers.tick(pageTurnInterval - 1);
    assert.equal(view.current(), 0);
    context.mock.timers.tick(1);
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "mouseenter");
    view.dispatch(view.root, "focusin");
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "mouseleave");
    view.tick();
    assert.equal(view.current(), 2);
});

test("manual paging works while hovered and hidden tabs continue advancing", (context) => {
    const view = fixture(context);
    view.dispatch(view.root, "mouseenter");
    view.tick();
    assert.equal(view.current(), 0);
    view.dispatch(view.previous, "click");
    assert.equal(view.current(), 2);
    assert.equal(view.position.getAttribute("aria-live"), "polite");
    view.dispatch(view.next, "click");
    assert.equal(view.current(), 0);
    view.dispatch(view.root, "mouseleave");
    view.document.hidden = true;
    view.dispatch(view.document, "visibilitychange");
    view.tick();
    assert.equal(view.current(), 1);
    view.document.hidden = false;
    view.dispatch(view.document, "visibilitychange");
    view.tick();
    assert.equal(view.current(), 2);
});

test("reduced motion does not stop automatic or manual paging", (context) => {
    const view = fixture(context, { reduced: true });
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.next, "click");
    assert.equal(view.current(), 2);
    view.motion.matches = false;
    view.dispatch(view.motion, "change");
    view.tick();
    assert.equal(view.current(), 0);
});

test("animation completion respects hover and cannot schedule duplicate transitions", async (context) => {
    const view = fixture(context);
    let finish;
    view.pages[0].animate = () => ({ finished: new Promise((resolve) => { finish = resolve; }), cancel() {} });
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.next, "click");
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "mouseenter");
    finish();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(view.pages[0].getAttribute("data-turning"), null);
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "mouseleave");
    view.tick();
    assert.equal(view.current(), 2);
});

test("one source needs no controls or automatic changes", (context) => {
    const view = fixture(context, { names: ["Page A"] });
    view.tick();
    assert.equal(view.current(), 0);
    assert.equal(view.controls.hidden, true);
});

test("background paging continues when animation completion is suspended", (context) => {
    const view = fixture(context);
    let cancelled = 0;
    view.pages.forEach((page) => {
        page.animate = () => ({ finished: new Promise(() => {}), cancel() { cancelled++; } });
    });
    view.document.hidden = true;
    view.dispatch(view.document, "visibilitychange");
    for (const expected of [1, 2, 0, 1]) {
        view.tick();
        assert.equal(view.current(), expected);
        context.mock.timers.tick(pageTurnDuration);
    }
    assert.equal(cancelled, 4);
});

test("leaving the window clears stale hover and returning only pauses when the pointer is over the block", (context) => {
    const view = fixture(context, { hovered: true });
    view.dispatch(view.window, "blur");
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.window, "focus");
    view.tick();
    assert.equal(view.current(), 1);
    view.document.hidden = true;
    view.dispatch(view.document, "visibilitychange");
    view.tick();
    assert.equal(view.current(), 2);
});
