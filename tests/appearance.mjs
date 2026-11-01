import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { appearanceConfiguration } from "../src/config/appearance.ts";

const script = await readFile(new URL("../src/scripts/appearance.js", import.meta.url), "utf8");
function appearance(saved, blocked = false) {
    const document = new EventTarget();
    const dataset = { appearanceConfig: JSON.stringify(appearanceConfiguration) };
    const controls = Object.entries(appearanceConfiguration.options).flatMap(([key, options]) => (key === "preset" ? options : [options[0]]).map((value) => Object.assign(new EventTarget(), {
        dataset: { appearanceSetting: key }, type: key === "preset" ? "radio" : "select-one", value, checked: false,
    })));
    const reset = new EventTarget();
    Object.assign(document, {
        documentElement: { dataset },
        querySelectorAll: () => controls,
        querySelector: () => reset,
    });
    runInNewContext(script, { document, Event, localStorage: {
        getItem() { if (blocked) throw new Error("Blocked"); return saved; },
        setItem(key, value) { if (blocked) throw new Error("Blocked"); assert.equal(key, "site-appearance"); saved = value; },
    } });
    return { document, dataset, controls, reset, saved: () => saved, ready() { document.dispatchEvent(new Event("DOMContentLoaded")); } };
}

test("appearance validates storage before first paint and persists changes and resets", () => {
    for (const saved of ["bad json", "null", '{"preset":"missing","dock":"invalid"}']) {
        const page = appearance(saved);
        for (const [key, value] of Object.entries(appearanceConfiguration.defaults)) assert.equal(page.dataset[key], value);
        page.ready();
    }
    const page = appearance('{"preset":"aviation","motion":"off","dock":"labels"}');
    assert.equal(page.dataset.preset, "aviation");
    assert.equal(page.dataset.motion, "off");
    page.ready();
    assert.equal(page.controls.find((control) => control.checked).value, "aviation");
    const piano = page.controls.find((control) => control.value === "piano");
    piano.checked = true;
    piano.dispatchEvent(new Event("change"));
    assert.equal(page.dataset.preset, "piano");
    assert.equal(page.dataset.darkColor, appearanceConfiguration.colors.piano.dark);
    assert.equal(JSON.parse(page.saved()).preset, "piano");
    assert.equal(page.controls.filter((control) => control.checked).length, 1);
    let resets = 0;
    page.document.addEventListener("site:reset", () => resets++);
    page.reset.dispatchEvent(new Event("click"));
    assert.equal(resets, 1);
    assert.deepEqual(JSON.parse(page.saved()), appearanceConfiguration.defaults);
    const restored = appearance(page.saved());
    assert.equal(restored.dataset.preset, "piano");
});

test("appearance remains usable when browser storage is unavailable", () => {
    const page = appearance(null, true);
    page.ready();
    const control = page.controls.find((control) => control.dataset.appearanceSetting === "density");
    control.value = "compact";
    control.dispatchEvent(new Event("change"));
    assert.equal(page.dataset.density, "compact");
    page.reset.dispatchEvent(new Event("click"));
    assert.equal(page.dataset.density, "comfortable");
});

test("retired presets fall back without losing the remaining appearance preferences", () => {
    const page = appearance('{"preset":"cs","wallpaper":"plain","dock":"labels","motion":"off"}');
    page.ready();
    assert.equal(page.dataset.preset, "piano");
    assert.equal(page.dataset.wallpaper, "plain");
    assert.equal(page.dataset.dock, "labels");
    assert.equal(page.dataset.motion, "off");
    assert.equal(page.controls.some((control) => control.value === "cs"), false);
    assert.equal(page.controls.find((control) => control.checked).value, "piano");
});
