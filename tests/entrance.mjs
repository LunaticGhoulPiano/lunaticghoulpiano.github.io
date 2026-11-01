import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const script = stripTypeScriptTypes(await readFile(new URL("../src/scripts/entrance.ts", import.meta.url), "utf8"))
    .replace(/^import .*motion\.ts.*;$/m, "").replaceAll("export ", "");

function element(name, left, top, width = 100, height = 40, parentElement = null) {
    return Object.assign(new EventTarget(), {
        name, parentElement, excluded: false,
        dataset: {},
        styles: { visibility: "visible", overflowX: "visible", overflowY: "visible" },
        closest() { return this.excluded ? this : null; },
        getClientRects: () => width > 0 && height > 0 ? [{}] : [],
        getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }),
    });
}

function fixture({ hold = false } = {}) {
    const document = Object.assign(new EventTarget(), { readyState: "loading" });
    const window = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 600 });
    const root = element("page", 0, 0, 800, 900);
    const items = [];
    const calls = [];
    root.querySelectorAll = () => items;
    document.querySelector = () => root;
    const api = runInNewContext(script + "\n({entranceItems, initializeEntrances})", {
        document, window, AbortController,
        getComputedStyle: (item) => item.styles,
        revealItems(items, signal, maxDelay) {
            calls.push({ items, signal, maxDelay });
            return hold ? new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })) : Promise.resolve();
        },
    });
    return { ...api, root, items, calls, document, window };
}

test("entrance includes only visible rows in nested clips, ordered by row then column", () => {
    const view = fixture();
    const track = element("track", 10, 100, 700, 400, view.root);
    track.styles.overflowX = "hidden";
    const timeline = element("timeline", 10, 140, 200, 250, track);
    timeline.styles.overflowY = "auto";
    const first = element("left row 1", 20, 160, 100, 40, timeline);
    const second = element("right row 1", 300, 160, 100, 40, track);
    const third = element("left row 2", 20, 230, 100, 40, timeline);
    const clipped = element("below timeline", 20, 410, 100, 40, timeline);
    const outside = element("offscreen category", 740, 160, 100, 40, track);
    const hidden = element("hidden source", 20, 180);
    hidden.excluded = true;
    const invisible = element("invisible", 20, 190);
    invisible.styles.visibility = "hidden";
    view.items.push(third, second, clipped, outside, hidden, first, invisible,
        element("below screen", 20, 650), element("empty", 20, 120, 0));
    assert.deepEqual(Array.from(view.entranceItems(view.root), (item) => item.name), ["left row 1", "right row 1", "left row 2"]);
});

test("each document enters once; carousel changes and newly visible items do not replay", async () => {
    const view = fixture();
    view.items.push(element("heading", 10, 10));
    await view.initializeEntrances();
    view.items.push(element("new source", 10, 100));
    await view.initializeEntrances();
    assert.equal(view.calls.length, 1);
    assert.equal(view.calls[0].items.length, 1);
    assert.equal(view.calls[0].maxDelay, 270);
});

test("DOM and router readiness alone never re-hide content; only the prepared page enters", async () => {
    const view = fixture();
    view.items.push(element("heading", 10, 10));
    view.document.dispatchEvent(new Event("DOMContentLoaded"));
    view.document.dispatchEvent(new Event("astro:page-load"));
    assert.equal(view.calls.length, 0);
    view.document.dispatchEvent(new Event("site:page-ready"));
    await Promise.resolve();
    assert.equal(view.calls.length, 1);
    view.document.dispatchEvent(new Event("site:page-ready"));
    assert.equal(view.calls.length, 1);
});

test("user input, scrolling and leaving the page cancel the entrance without changing focus or scroll", async () => {
    for (const mode of ["all", "visible"]) {
    for (const type of ["pointerdown", "touchstart", "wheel", "keydown", "scroll", "astro:before-preparation", "pagehide"]) {
        const view = fixture({ hold: true });
        view.root.dataset.entrance = mode;
        view.items.push(element("row", 10, 100));
        const entering = view.initializeEntrances();
        const target = type === "pagehide" ? view.window : type.startsWith("astro:") ? view.document : view.root;
        target.dispatchEvent(new Event(type));
        await entering;
        assert.equal(view.calls[0].signal.aborted, true, type);
        await view.initializeEntrances();
        assert.equal(view.calls.length, 1);
    }
    }
});

test("any marked page can reveal all laid-out items in DOM order using the same lifecycle", async () => {
    const view = fixture();
    view.root.dataset.entrance = "all";
    const hidden = element("filtered", 10, 80);
    hidden.excluded = true;
    view.items.push(element("first", 10, 100), element("below screen", 10, 900), hidden, element("empty", 10, 80, 0));
    await view.initializeEntrances();
    assert.deepEqual(Array.from(view.calls[0].items, (item) => item.name), ["first", "below screen"]);
    assert.equal(view.calls[0].maxDelay, Infinity);
    await view.initializeEntrances();
    assert.equal(view.calls.length, 1);
});
