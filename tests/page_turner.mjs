import test from "node:test";
import assert from "node:assert/strict";
import { initializePageTurners } from "../src/scripts/page_turner.ts";
import { pageTurnInterval } from "../src/config/collections.ts";

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
    const environment = {
        document,
        window: { matchMedia: () => motion },
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

test("hover and keyboard focus independently pause paging and departure starts a full interval", (context) => {
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
    view.dispatch(view.root, "mouseleave");
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "focusout", { relatedTarget: view.next });
    view.tick();
    assert.equal(view.current(), 1);
    view.dispatch(view.root, "focusout", { relatedTarget: null });
    view.tick();
    assert.equal(view.current(), 2);
});

test("manual paging works while hovered and hidden tabs do not advance or catch up", (context) => {
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
    assert.equal(view.current(), 0);
    view.document.hidden = false;
    view.dispatch(view.document, "visibilitychange");
    view.tick();
    assert.equal(view.current(), 1);
});

test("reduced motion stops automatic changes but preserves manual access to every page", (context) => {
    const view = fixture(context, { reduced: true });
    view.tick();
    assert.equal(view.current(), 0);
    view.dispatch(view.next, "click");
    assert.equal(view.current(), 1);
    view.motion.matches = false;
    view.dispatch(view.motion, "change");
    view.tick();
    assert.equal(view.current(), 2);
});

test("animation completion respects hover and cannot schedule duplicate transitions", async (context) => {
    const view = fixture(context);
    let finish;
    view.pages[0].animate = () => ({ finished: new Promise((resolve) => { finish = resolve; }) });
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
