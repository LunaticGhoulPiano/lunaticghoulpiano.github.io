import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { discoverContent } from "../../scripts/content/loader.mjs";
import { prepareSite, copySite, siteFile } from "../../scripts/content/sites.mjs";
import { itemContent } from "../../scripts/content/integration.mjs";
import { configuration, writeItem } from "./fixture.mjs";

test("site lookup and copying preserve nested assets without escaping or overwriting", async () => {
    await withTemporaryDirectory(async (root) => {
        await writeItem(root, configuration("site", { type: "site", root: "./built", path: "/docs/site/" }), {
            "built/index.html": "index", "built/guide/index.html": "guide", "built/app.js": "script",
        });
        const [item] = await discoverContent(root);
        const site = await prepareSite(root, item);
        assert.equal(await readFile(await siteFile(site.directory, "/guide/"), "utf8"), "guide");
        assert.equal(await siteFile(site.directory, "/../configs.json"), undefined);
        assert.equal(await siteFile(site.directory, "/missing/"), undefined);
        const target = join(root, "dist/docs/site");
        await copySite(site.directory, target);
        assert.equal(await readFile(join(target, "app.js"), "utf8"), "script");
        await assert.rejects(copySite(site.directory, target), /EEXIST/);
    });
});

test("development watcher excludes configured site outputs and swaps while keeping source content watched", async () => {
    await withTemporaryDirectory(async (root) => {
        const config = configuration("site", { type: "site", root: "./custom-output/en", path: "/docs/site/" });
        config.locales["zh-tw"] = { ...config.locales.en, entry: { ...config.locales.en.entry, root: "./localized/zh-tw" } };
        const directory = await writeItem(root, config, {
            "custom-output/en/index.html": "English", "localized/zh-tw/index.html": "Chinese",
            "docs/guide.md": "Source document",
        });
        const codegen = join(root, ".astro/item-content");
        await mkdir(codegen, { recursive: true });
        let options;
        await itemContent().hooks["astro:config:setup"]({
            config: { root: pathToFileURL(root + "/") },
            updateConfig: (value) => { options = value; },
            injectRoute: () => assert.fail("Standalone sites must not inject Astro routes"),
            createCodegenDir: () => pathToFileURL(codegen + "/"),
            addWatchFile: () => {},
        });
        const [ignored] = options.vite.server.watch.ignored;
        for (const path of ["custom-output/en", "custom-output/en/index.html", "custom-output/.en-swap/next", "localized/zh-tw", "localized/.zh-tw-swap/previous/index.html"]) {
            assert.equal(ignored(join(directory, path)), true, path);
        }
        for (const path of ["configs.json", "docs/guide.md", "custom-output/en-not-output/file.md", "localized", "custom-output"]) {
            assert.equal(ignored(join(directory, path)), false, path);
        }
    });
});
