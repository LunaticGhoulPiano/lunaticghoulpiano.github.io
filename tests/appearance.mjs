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
    runInNewContext(script, { document, window: new EventTarget(), Event, localStorage: {
        getItem() { if (blocked) throw new Error("Blocked"); return saved; },
        setItem(key, value) { if (blocked) throw new Error("Blocked"); assert.equal(key, "site-appearance"); saved = value; },
    } });
    return { document, dataset, controls, reset, saved: () => saved, ready() { document.dispatchEvent(new Event("DOMContentLoaded")); } };
}

test("appearance validates storage before first paint and persists changes and resets", () => {
    for (const saved of ["bad json", "null", '{"preset":"missing"}']) {
        const page = appearance(saved);
        for (const [key, value] of Object.entries(appearanceConfiguration.defaults)) assert.equal(page.dataset[key], value);
        page.ready();
    }
    const page = appearance('{"preset":"aviation"}');
    assert.equal(page.dataset.preset, "aviation");
    page.ready();
    assert.equal(page.controls.find((control) => control.checked).value, "aviation");
    const piano = page.controls.find((control) => control.value === "piano");
    piano.checked = true;
    piano.dispatchEvent(new Event("change"));
    assert.equal(page.dataset.preset, "piano");
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
    const control = page.controls.find((control) => control.value === "aviation");
    control.checked = true;
    control.dispatchEvent(new Event("change"));
    assert.equal(page.dataset.preset, "aviation");
    page.reset.dispatchEvent(new Event("click"));
    assert.equal(page.dataset.preset, appearanceConfiguration.defaults.preset);
});

test("retired presets fall back to the default appearance", () => {
    const page = appearance('{"preset":"cs"}');
    page.ready();
    assert.equal(page.dataset.preset, "piano");
    assert.equal(page.controls.some((control) => control.value === "cs"), false);
    assert.equal(page.controls.find((control) => control.checked).value, "piano");
});

test("removed appearance settings cannot override the fixed presentation on returning visits", () => {
    const page = appearance('{"preset":"aviation","wallpaper":"plain","shade":"deep","dock":"icons","motion":"off","density":"compact"}');
    page.ready();
    assert.equal(page.dataset.preset, "aviation");
    for (const key of ["wallpaper", "shade", "dock", "motion", "density"]) {
        assert.equal(page.dataset[key], undefined);
        assert.equal(page.controls.some((control) => control.dataset.appearanceSetting === key), false);
    }
    const piano = page.controls.find((control) => control.value === "piano");
    piano.checked = true;
    piano.dispatchEvent(new Event("change"));
    assert.deepEqual(JSON.parse(page.saved()), { preset: "piano" });
});
