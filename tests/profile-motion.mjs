import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const helpers = stripTypeScriptTypes(await readFile(new URL("../src/scripts/motion.ts", import.meta.url), "utf8")).replaceAll("export ", "");
const entrance = stripTypeScriptTypes(await readFile(new URL("../src/scripts/entrance.ts", import.meta.url), "utf8"))
    .replace(/^import .*motion\.ts.*;$/m, "").replaceAll("export ", "");
const script = helpers + "\n" + entrance + "\n" + stripTypeScriptTypes(await readFile(new URL("../src/scripts/profile-motion.ts", import.meta.url), "utf8"))
    .replace(/^import .*motion\.ts.*;$/m, "");

function browser({ reduced = false, detail = true, scrollY = 0, holdAnimations = false } = {}) {
    const listeners = new Map();
    const effects = [];
    const animations = [];
    const element = (name) => Object.assign(new EventTarget(), {
        name,
        dataset: { entrance: "all" },
        closest: () => null,
        style: { removeProperty(key) { delete this[key]; } },
        attributes: new Set(),
        setAttribute(key) { this.attributes.add(key); },
        removeAttribute(key) { this.attributes.delete(key); },
        getClientRects: () => [{}],
        animate(frames, options) {
            effects.push([name, "fade", frames[0].opacity ?? Number(frames[0]["--entrance-progress"]), frames[1].opacity ?? Number(frames[1]["--entrance-progress"])]);
            let reject;
            let resolve;
            const animation = {
                name, frames, options, cancelled: false,
                finished: holdAnimations ? new Promise((done, fail) => { resolve = done; reject = fail; }) : Promise.resolve(),
                finish() { resolve?.(); },
                cancel() { this.cancelled = true; reject?.(new Error("cancelled")); },
            };
            animations.push(animation);
            return animation;
        },
    });
    const itemNames = ["name", "alias", "overview", "resume", "social"];
    if (detail) itemNames.push("heading");
    itemNames.push("label-1", "value-1", "label-2", "value-2");
    const page = (name) => Object.assign(element(name), {
        items: itemNames.map((item) => element(`${name}:${item}`)),
        querySelectorAll() { return this.items; },
    });
    const oldPage = page("old");
    const newPage = page("new");
    let current = oldPage;
    const window = Object.assign(new EventTarget(), {
        scrollY,
        matchMedia: () => Object.assign(new EventTarget(), { matches: reduced }),
        scrollTo({ top }) {
            this.scrollY = top;
            effects.push(["scroll", top]);
        },
    });
    const focus = (id) => (options) => {
        assert.equal(options?.preventScroll, true);
        effects.push(["focus", id]);
    };
    const content = {
        classList: { contains: () => detail },
        getBoundingClientRect: () => ({ top: 424 - window.scrollY }),
        focus: focus("profile-content"),
    };
    const main = { focus: focus("main-content") };
    const document = {
        readyState: "loading",
        querySelector: () => current,
        getElementById: (id) => ({ "profile-content": content, "main-content": main })[id],
        addEventListener(name, listener) { listeners.set(name, [...(listeners.get(name) ?? []), listener]); },
    };
    runInNewContext(script, { document, window, AbortController });
    const controller = new AbortController();
    const event = {
        navigationType: "push",
        sourceElement: { closest: () => ({}) },
        signal: controller.signal,
        newDocument: { querySelector: () => newPage },
        loader: async () => { effects.push(["load"]); },
    };
    const dispatch = (name, event) => Promise.all((listeners.get(name) ?? []).map((listener) => listener(event)));
    return { event, effects, animations, window, oldPage, newPage, controller,
        ready() { return dispatch("DOMContentLoaded"); },
        load() { return dispatch("astro:page-load"); },
        prepare() { void dispatch("astro:before-preparation", event); return event.loader(); },
        reveal() { current = newPage; return dispatch("astro:page-load"); },
    };
}

test("DOM readiness reveals items before window.load and page-load does not replay the entrance", async () => {
    const page = browser();
    const hidden = page.oldPage.items[4];
    hidden.getClientRects = () => [];
    await page.ready();
    const visible = page.oldPage.items.filter((item) => item !== hidden);
    assert.deepEqual(page.animations.map((animation) => animation.name), visible.map((item) => item.name));
    const delays = page.animations.map((animation) => animation.options.delay);
    assert.equal(delays[0], 0);
    assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]));
    for (const animation of page.animations) {
        assert.equal(animation.frames[0]["--entrance-progress"], "0");
        assert.equal(animation.frames[1]["--entrance-progress"], "1");
        assert.equal(animation.frames[0].transform, undefined, "Entrance must not replace the timeline or focus transform.");
        assert.equal(animation.options.fill, "backwards");
        assert.equal(animation.cancelled, true);
    }
    assert.ok(visible.every((item) => !item.attributes.has("data-entering")));
    assert.equal(page.effects.some((effect) => ["focus", "scroll"].includes(effect[0])), false);
    await page.load();
    assert.equal(page.animations.length, visible.length, "The same document must not animate twice.");
});

test("Overview and Resume fade and focus the main content without scrolling past the header", async () => {
    for (const detail of [true, false]) {
        const page = browser({ detail });
        await page.prepare();
        assert.equal(page.newPage.style.opacity, undefined);
        await page.reveal();
        assert.deepEqual(page.effects, [
            ["load"], ["old", "fade", 1, 0],
            ...page.newPage.items.map((item) => [item.name, "fade", 0, 1]),
            ["focus", "main-content"],
        ]);
        assert.equal(page.window.scrollY, 0);
        assert.equal(page.newPage.style.opacity, undefined);
    }
});

test("reduced motion focuses without animations or automatic scrolling", async () => {
    for (const detail of [true, false]) {
        const page = browser({ reduced: true, detail });
        await page.load();
        assert.deepEqual(page.effects, []);
        await page.prepare();
        await page.reveal();
        assert.deepEqual(page.effects, [["load"], ["focus", "main-content"]]);
        assert.equal(page.window.scrollY, 0);
        assert.equal(page.newPage.style.opacity, undefined);
    }
});

test("history traversal and unrelated links do not override scroll restoration", async () => {
    for (const change of [{ navigationType: "traverse" }, { sourceElement: undefined }]) {
        const page = browser({ scrollY: 360 });
        Object.assign(page.event, change);
        await page.prepare();
        await page.reveal();
        assert.deepEqual(page.effects, [
            ["load"], ...page.newPage.items.map((item) => [item.name, "fade", 0, 1]),
        ]);
        assert.equal(page.window.scrollY, 360);
    }
});

test("failed loads and superseded navigation never leave the current page faded out", async () => {
    const failed = browser();
    failed.event.loader = async () => { throw new Error("network"); };
    await assert.rejects(failed.prepare(), /network/);
    assert.equal(failed.oldPage.style.opacity, undefined);
    const aborted = browser();
    await aborted.prepare();
    aborted.controller.abort();
    assert.equal(aborted.oldPage.style.opacity, undefined);
    assert.equal(aborted.effects.some((effect) => effect[0] === "scroll"), false);
});

test("leaving during an entrance cancels all item animations even when the next load fails", async () => {
    const page = browser({ holdAnimations: true });
    const entering = page.load();
    assert.ok(page.animations.length > 0);
    assert.ok(page.animations.every((animation) => !animation.cancelled));
    page.event.loader = async () => { throw new Error("network"); };
    await assert.rejects(page.prepare(), /network/);
    await entering;
    assert.ok(page.animations.every((animation) => animation.cancelled));
    assert.equal(page.oldPage.style.opacity, undefined);
    assert.ok(page.oldPage.items.every((item) => item.style.opacity === undefined));
    assert.equal(page.effects.some((effect) => effect[0] === "scroll"), false);
});

test("cancelling an entrance cannot clear the opacity owned by the next exit", async () => {
    const page = browser({ holdAnimations: true });
    const entering = page.ready();
    const leaving = page.prepare();
    await entering;
    assert.equal(page.oldPage.style.opacity, "0");
    page.animations.find((animation) => animation.name === "old").finish();
    await leaving;
    assert.equal(page.oldPage.style.opacity, "0");
    assert.equal(page.newPage.style.opacity, undefined);
});
