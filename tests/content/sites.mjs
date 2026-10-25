import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { discoverContent } from "../../scripts/content/loader.mjs";
import { prepareSite, copySite, siteFile } from "../../scripts/content/sites.mjs";
import { configuration, writeItem } from "./fixture.mjs";
import { defaultLocale } from "../../src/config/locales.ts";

test("static site lookup and copying preserve nested assets without escaping or overwriting", async () => {
    await withTemporaryDirectory(async (root) => {
        await writeItem(root, configuration("static", { type: "site", engine: "static", root: "./built", path: "/docs/static/" }), {
            "built/index.html": "index", "built/guide/index.html": "guide", "built/app.js": "script",
        });
        const [item] = await discoverContent(root);
        const site = await prepareSite(root, item, "https://example.test");
        assert.equal(await readFile(await siteFile(site.directory, "/guide/"), "utf8"), "guide");
        assert.equal(await siteFile(site.directory, "/../configs.json"), undefined);
        assert.equal(await siteFile(site.directory, "/missing/"), undefined);
        const target = join(root, "dist/docs/static");
        await copySite(site.directory, target);
        assert.equal(await readFile(join(target, "app.js"), "utf8"), "script");
        await assert.rejects(copySite(site.directory, target), /EEXIST/);
        await site.dispose();
    });
});

test("Docusaurus adapter resolves local dependencies, passes locale and mount configuration, and reports build failures", async () => {
    await withTemporaryDirectory(async (root) => {
        const config = configuration("docs", { type: "site", engine: "docusaurus", root: "./docs", path: "/docs/fixture/" });
        const directory = await writeItem(root, config, {
            "docs/docusaurus.config.mjs": 'export default async () => ({ title: "Fixture docs", url: "https://old.test", baseUrl: "/old/", i18n: { defaultLocale: "en", locales: ["en"] } });',
        });
        const [item] = await discoverContent(root);
        await assert.rejects(prepareSite(root, item, "https://example.test"), /dependencies/);
        const packageDirectory = join(directory, "docs/node_modules/@docusaurus/core");
        await mkdir(packageDirectory, { recursive: true });
        await writeFile(join(packageDirectory, "package.json"), '{"name":"@docusaurus/core","type":"module","bin":{"docusaurus":"cli.mjs"}}');
        await writeFile(join(packageDirectory, "cli.mjs"), `
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv;
const config = await (await import(pathToFileURL(args[args.indexOf("--config") + 1]).href)).default();
const output = args[args.indexOf("--out-dir") + 1];
await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), "Fixture docs");
await writeFile(join(output, "received.json"), JSON.stringify({ config, args }));
`);
        const prepared = await prepareSite(root, item, "https://example.test");
        const received = JSON.parse(await readFile(join(prepared.directory, "received.json"), "utf8"));
        assert.equal(received.config.title, "Fixture docs");
        assert.equal(received.config.url, "https://example.test");
        assert.equal(received.config.baseUrl, item.data.href);
        assert.equal(received.config.i18n.localeConfigs[defaultLocale].baseUrl, item.data.href);
        assert.equal(received.args[received.args.indexOf("--locale") + 1], defaultLocale);
        await prepared.dispose();
        await writeFile(join(packageDirectory, "cli.mjs"), "process.exit(3);");
        await assert.rejects(prepareSite(root, item, "https://example.test"), /exit 3/);
        assert.deepEqual(await readdir(join(root, "temp")), []);
    });
});
