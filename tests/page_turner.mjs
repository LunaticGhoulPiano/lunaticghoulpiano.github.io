import { installGlobals } from "./fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { initializePageTurners } from "../src/scripts/page_turner.ts";

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

function fixture(context, { names = ["Page A", "Page B", "Page C"] } = {}) {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const pages = names.map((name) => {
        const page = element();
        page.setAttribute("aria-label", name);
        page.scrollTop = 120;
        page.animate = () => assert.fail("Page switches must not animate.");
        return page;
    });
    const nodes = Object.fromEntries(["controls", "previous", "next", "position"].map((key) => [key, element()]));
    const headings = names.map(() => element());
    nodes.pages = { children: pages };
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
    const environment = {
        document,
        window,
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
        dispatch(target, type, properties = {}) {
            target.dispatchEvent(Object.assign(new Event(type), properties));
        },
    };
}

test("manual source changes are immediate, wrap in both directions and retain timeline nodes", (context) => {
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
