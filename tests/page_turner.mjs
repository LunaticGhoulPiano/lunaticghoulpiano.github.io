import { installGlobals } from "./fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { initializePageTurners } from "../src/scripts/page_turner.ts";

function element() {
    const attributes = new Map();
    return Object.assign(new EventTarget(), {
        dataset: {},
        style: { removeProperty(name) { delete this[name]; } },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: (name) => attributes.get(name) ?? null,
        removeAttribute: (name) => attributes.delete(name),
        toggleAttribute(name, enabled) {
            if (enabled) attributes.set(name, "");
            else attributes.delete(name);
        },
    });
}

function fixture(context, { names = ["Page A", "Page B", "Page C"], reduced = true } = {}) {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const pages = names.map((name) => {
        const page = element();
        page.setAttribute("aria-label", name);
        page.scrollTop = 120;
        return page;
    });
    const nodes = Object.fromEntries(["controls", "previous", "next", "position"].map((key) => [key, element()]));
    const headings = names.map(() => element());
    nodes.pages = Object.assign(element(), { children: pages });
    const root = Object.assign(element(), {
        contains: (target) => target != null && (pages.includes(target) || Object.values(nodes).includes(target)),
        querySelector: (selector) => nodes[selector.slice("[data-page-turner-".length, -1)],
        querySelectorAll: () => headings,
    });
    const document = Object.assign(element(), {
        hidden: false,
        activeElement: null,
        querySelectorAll: () => [root],
    });
    const window = element();
    window.matchMedia = () => Object.assign(new EventTarget(), { matches: reduced });
    const frames = new Map();
    let frameId = 0;
    const environment = {
        document,
        window,
        requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
    };
    installGlobals(context, environment);
    initializePageTurners();
    return {
        ...nodes,
        root,
        document,
        window,
        pages,
        headings,
        current: () => pages.findIndex((page) => page.getAttribute("data-current") !== null),
        tick: () => context.mock.timers.tick(60_000),
        frame(now) { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now)); },
        dispatch(target, type, properties = {}) {
            target.dispatchEvent(Object.assign(new Event(type), properties));
        },
    };
}

test("reduced-motion source changes are immediate, wrap in both directions and retain timeline nodes", (context) => {
    const view = fixture(context);
    assert.equal(view.current(), 0);
    view.dispatch(view.previous, "click");
    assert.equal(view.current(), 2);
    for (const expected of [0, 1, 2, 0]) {
        view.dispatch(view.next, "click");
        assert.equal(view.current(), expected);
        view.pages.forEach((page, index) => {
            assert.equal(page.inert, index !== expected);
            assert.equal(page.getAttribute("aria-hidden"), String(index !== expected));
            assert.equal(page.scrollTop, 120);
            assert.equal(view.headings[index].getAttribute("data-current") !== null, index === expected);
            assert.equal(view.headings[index].inert, index !== expected);
        });
    }
    assert.equal(view.position.getAttribute("aria-live"), "polite");
});

test("source transitions reverse from their visible positions without resetting or replacing pages", (context) => {
    const view = fixture(context, { reduced: false });
    view.dispatch(view.next, "click");
    assert.equal(view.pages[1].style.translate, "100% 0");
    view.frame(0);
    view.frame(280);
    assert.equal(view.pages[0].style.translate, "-50% 0");
    assert.equal(view.pages[1].style.translate, "50% 0");
    view.dispatch(view.previous, "click");
    assert.equal(view.current(), 0);
    assert.equal(view.pages[0].style.translate, "-50% 0");
    assert.equal(view.pages[1].style.translate, "50% 0");
    view.frame(300);
    view.frame(860);
    for (const page of view.pages) {
        assert.equal(page.getAttribute("data-leaving"), null);
        assert.equal(page.style.translate, undefined);
        assert.equal(page.scrollTop, 120);
    }
});

for (const names of [["A", "B"], ["A", "B", "C"]]) {
    test(`${names.length} sources remain continuous through repeated forward and backward wraps`, (context) => {
        const view = fixture(context, { names, reduced: false });
        let time = 0;
        for (const direction of [1, 1, 1, 1, -1, -1, -1, -1]) {
            const visible = view.pages.filter((page) => Math.abs(Number.parseFloat(page.style.translate ?? "0")) < 100
                && (page.getAttribute("data-current") !== null || page.getAttribute("data-leaving") !== null));
            const before = visible.map((page) => page.style.translate ?? "0% 0");
            view.dispatch(direction > 0 ? view.next : view.previous, "click");
            assert.deepEqual(visible.map((page) => page.style.translate), before);
            view.frame(time);
            time += 140;
            view.frame(time);
        }
        view.frame(time + 560);
        assert.equal(view.current(), 0);
        assert.ok(view.pages.every((page) => page.style.translate === undefined));
    });
}

test("source pages remain stationary regardless of hover, focus, elapsed time or hidden tabs", (context) => {
    const view = fixture(context);
    for (const name of ["mouseenter", "mouseleave", "focusin"]) view.dispatch(view.root, name);
    view.document.hidden = true;
    view.dispatch(view.document, "visibilitychange");
    view.dispatch(view.window, "blur");
    view.tick();
    assert.equal(view.current(), 0);
    view.dispatch(view.next, "click");
    view.tick();
    assert.equal(view.current(), 1);
});

test("one source hides paging controls and repeated initialization does not duplicate actions", (context) => {
    const view = fixture(context, { names: ["Only source"] });
    initializePageTurners();
    assert.equal(view.controls.hidden, true);
    assert.equal(view.previous.disabled, true);
    assert.equal(view.next.disabled, true);
    view.dispatch(view.next, "click");
    view.tick();
    assert.equal(view.current(), 0);
});
