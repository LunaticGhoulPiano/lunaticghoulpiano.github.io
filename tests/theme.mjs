import { themes } from "../src/config/theme.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../src/scripts/theme.js", import.meta.url), "utf8");

function browser({ dark = false, saved = null, storageBlocked = false } = {}) {
    const mediaListeners = new Map();
    const documentListeners = new Map();
    const buttonListeners = new Map();
    const attributes = new Map();
    const dataset = {
        lightColor: themes.light.background,
        darkColor: themes.dark.background,
    };
    let themeColor;
    const media = {
        matches: dark,
        addEventListener: (name, listener) => mediaListeners.set(name, listener),
    };
    const button = {
        hidden: true,
        dataset: {
            systemLabel: "System selected",
            lightLabel: "Light selected",
            darkLabel: "Dark selected",
        },
        setAttribute: (name, value) => attributes.set(name, value),
        addEventListener: (name, listener) => buttonListeners.set(name, listener),
    };
    const storage = {
        getItem: () => {
            if (storageBlocked) throw new Error("Storage blocked");
            return saved;
        },
        setItem: (key, value) => {
            if (storageBlocked) throw new Error("Storage blocked");
            assert.equal(key, "site-theme");
            saved = value;
        },
    };
    const document = {
        documentElement: {
            dataset,
        },
        querySelector: (selector) => {
            if (selector === "[data-theme-toggle]") return button;
            assert.equal(selector, 'meta[name="theme-color"]');
            return {
                setAttribute: (name, value) => {
                    assert.equal(name, "content");
                    themeColor = value;
                },
            };
        },
        addEventListener: (name, listener) => documentListeners.set(name, listener),
    };
    runInNewContext(script, {
        window: {
            matchMedia: (query) => {
                assert.equal(query, "(prefers-color-scheme: dark)");
                return media;
            },
        },
        document,
        localStorage: storage,
    });

    return {
        dataset,
        button,
        attributes,
        themeColor: () => themeColor,
        saved: () => saved,
        ready: () => documentListeners.get("DOMContentLoaded")(),
        click: () => buttonListeners.get("click")(),
        system: (value) => {
            media.matches = value;
            mediaListeners.get("change")();
        },
    };
}

test("first visit follows the system before DOM ready and reacts to system changes", () => {
    for (const dark of [false, true]) {
        const page = browser({
            dark,
        });
        assert.equal(page.dataset.themePreference, "system");
        assert.equal(page.dataset.theme, dark ? "dark" : "light");
        assert.equal(page.themeColor(), dark ? themes.dark.background : themes.light.background);
        assert.equal(page.saved(), null);
        page.ready();
        assert.equal(page.button.hidden, false);
        assert.equal(page.attributes.get("aria-label"), "System selected");
        page.system(! dark);
        assert.equal(page.dataset.theme, dark ? "light" : "dark");
        assert.equal(page.themeColor(), dark ? themes.light.background : themes.dark.background);
    }
});

test("explicit light and dark choices override the system on subsequent pages", () => {
    for (const saved of ["light", "dark"]) {
        const page = browser({
            dark: saved !== "dark",
            saved,
        });
        assert.equal(page.dataset.theme, saved);
        assert.equal(page.dataset.themePreference, saved);
        page.system(true);
        page.system(false);
        assert.equal(page.dataset.theme, saved);
    }
});

test("the toggle cycles through light, dark and system and restores live system tracking", () => {
    const page = browser({
        dark: true,
    });
    page.ready();
    page.click();
    assert.equal(page.dataset.theme, "light");
    assert.equal(page.saved(), "light");
    assert.equal(page.attributes.get("aria-label"), "Light selected");
    page.click();
    assert.equal(page.dataset.theme, "dark");
    assert.equal(page.saved(), "dark");
    page.system(false);
    assert.equal(page.dataset.theme, "dark");
    page.click();
    assert.equal(page.dataset.themePreference, "system");
    assert.equal(page.dataset.theme, "light");
    assert.equal(page.saved(), "system");
    page.system(true);
    assert.equal(page.dataset.theme, "dark");
    const nextPage = browser({
        saved: page.saved(),
    });
    assert.equal(nextPage.dataset.themePreference, "system");
    assert.equal(nextPage.dataset.theme, "light");
});

test("invalid preferences and blocked storage fall back to the system without breaking the toggle", () => {
    for (const storageBlocked of [false, true]) {
        const page = browser({
            dark: true,
            saved: "invalid",
            storageBlocked,
        });
        assert.equal(page.dataset.themePreference, "system");
        assert.equal(page.dataset.theme, "dark");
        page.ready();
        page.click();
        assert.equal(page.dataset.theme, "light");
    }
});
