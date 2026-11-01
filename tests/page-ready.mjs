import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const bootstrap = await readFile(new URL("../src/scripts/page-ready.js", import.meta.url), "utf8");

function fixture() {
    const root = () => ({
        attributes: new Set(),
        setAttribute(name) { this.attributes.add(name); },
        removeAttribute(name) { this.attributes.delete(name); },
    });
    const document = Object.assign(new EventTarget(), { documentElement: root() });
    const window = new EventTarget();
    const frames = new Map(), timers = new Map();
    const events = [];
    let id = 0;
    document.addEventListener("site:page-ready", () => events.push({
        concealed: document.documentElement.attributes.has("data-page-pending"),
    }));
    runInNewContext(bootstrap, {
        document, window, Event,
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
        cancelAnimationFrame(key) { frames.delete(key); },
        setTimeout(callback) { timers.set(++id, callback); return id; },
        clearTimeout(key) { timers.delete(key); },
    });
    return {
        document, window, events,
        pending: () => document.documentElement.attributes.has("data-page-pending"),
        frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); },
        timeout() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
        dispatch(type, fields = {}, target = document) { target.dispatchEvent(Object.assign(new Event(type), fields)); },
        swap() {
            const newDocument = { documentElement: root() };
            document.dispatchEvent(Object.assign(new Event("astro:before-swap"), { newDocument }));
            assert.ok(newDocument.documentElement.attributes.has("data-page-pending"), "The next document is prepared before it can paint.");
            document.documentElement = newDocument.documentElement;
        },
        idle: () => frames.size === 0 && timers.size === 0,
    };
}

test("first paint stays concealed through module initialization and layout, then reveals once", () => {
    const page = fixture();
    assert.equal(page.pending(), true, "The head script gates the page before body parsing.");
    page.frame(); // The browser can paint while modules are still downloading.
    assert.equal(page.pending(), true);
    assert.equal(page.events.length, 0);
    page.dispatch("DOMContentLoaded");
    page.frame(); // Other initializers can update controls, pagination and layout here.
    assert.equal(page.pending(), true);
    assert.equal(page.events.length, 0);
    page.frame();
    assert.deepEqual(page.events, [{ concealed: true }], "Entrance starts before the gate is removed.");
    assert.equal(page.pending(), false);
    page.dispatch("astro:page-load");
    page.frame();
    assert.equal(page.events.length, 1);
    assert.equal(page.idle(), true);
});

test("stalled or failed modules reveal readable HTML and late readiness never replays an entrance", () => {
    const page = fixture();
    page.timeout();
    assert.equal(page.pending(), false);
    page.dispatch("DOMContentLoaded");
    page.dispatch("astro:page-load");
    page.frame();
    page.frame();
    assert.equal(page.events.length, 0);
    assert.equal(page.idle(), true);
});

test("interaction and bfcache restoration release pending content without hiding it again", () => {
    for (const type of ["pointerdown", "touchstart", "wheel", "keydown", "pagehide", "pageshow"]) {
        const page = fixture();
        page.dispatch("DOMContentLoaded");
        page.frame();
        page.dispatch(type, { persisted: true }, type.startsWith("page") ? page.window : page.document);
        page.frame();
        assert.equal(page.pending(), false, type);
        assert.equal(page.events.length, 0, type);
        assert.equal(page.idle(), true, type);
    }
});

test("Profile route swaps prepare the new document and stale callbacks cannot reveal it early", () => {
    const page = fixture();
    page.dispatch("DOMContentLoaded");
    page.frame();
    page.swap(); // Cancel the old document's pending second frame.
    page.frame();
    assert.equal(page.pending(), true);
    assert.equal(page.events.length, 0);
    page.dispatch("astro:page-load");
    page.frame();
    page.frame();
    assert.deepEqual(page.events, [{ concealed: true }]);
    assert.equal(page.pending(), false);
    page.swap();
    page.dispatch("astro:page-load");
    page.frame();
    page.frame();
    assert.equal(page.events.length, 2);
    assert.equal(page.idle(), true);
});
