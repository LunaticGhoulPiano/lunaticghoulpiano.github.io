import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { discoverContent } from "../../scripts/content/loader.mjs";
import { prepareSite, copySite, siteFile } from "../../scripts/content/sites.mjs";
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
