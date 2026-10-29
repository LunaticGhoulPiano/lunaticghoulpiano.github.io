import test from "node:test";
import assert from "node:assert/strict";
import { cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildContents, buildOptions, runCommand } from "../../scripts/content/build.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { configuration, writeItem } from "./fixture.mjs";

const builder = `import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { locale: { type: "string" }, "out-dir": { type: "string" } } });
const text = await readFile("source/" + values.locale + ".txt", "utf8");
await mkdir(values["out-dir"], { recursive: true });
await writeFile(join(values["out-dir"], "asset.txt"), text);
if (text === "fail") throw new Error("Fixture build failed");
if (text !== "no-index") await writeFile(join(values["out-dir"], "index.html"), "<h1>" + text + "</h1>");
`;

async function fixture(root, id = "first", placements = ["documentations", "projects"]) {
    await writeFile(join(root, "shared.txt"), "shared");
    const config = configuration(id, { type: "site", root: "./build/en", path: `/${id}/` });
    config.placements = placements;
    config.locales["zh-tw"] = { ...config.locales.en, entry: { ...config.locales.en.entry, root: "./build/zh-tw" } };
    config.build = {
        command: ["node", "build.mjs", "--locale", "{locale}", "--out-dir", "{outDir}"],
        inputs: ["./build.mjs", "./source/{locale}.txt", "./pnpm-lock.yaml"],
        sharedInputs: ["./shared.txt"],
    };
    const directory = await writeItem(root, config, {
        "build.mjs": builder,
        "source/en.txt": "English",
        "source/zh-tw.txt": "Chinese",
        "pnpm-lock.yaml": "fixture-lock",
    });
    return { directory, config };
}

const quiet = { log: () => {} };
const built = (results) => results.filter((result) => result.built).map(({ id, locale }) => `${id}/${locale}`);

test("content builds discover targets without output files and reuse unchanged per-locale results", async () => {
    await withTemporaryDirectory(async (root) => {
        const { directory } = await fixture(root);
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en", "first/zh-tw"]);
        assert.deepEqual(built(await buildContents({ root, ...quiet, run: () => assert.fail("Unchanged content must not build") })), []);
        await rm(join(directory, "build"), { recursive: true });
        await buildContents({ root, ...quiet, run: () => assert.fail("Missing output must restore from a valid cache") });
        assert.equal(await readFile(join(directory, "build/en/index.html"), "utf8"), "<h1>English</h1>");
        await writeFile(join(directory, "build/en/index.html"), "corrupted output");
        await buildContents({ root, ...quiet, run: () => assert.fail("Corrupted output must restore from cache") });
        assert.equal(await readFile(join(directory, "build/en/index.html"), "utf8"), "<h1>English</h1>");
    });
});

test("locale inputs invalidate one target while shared inputs, locked dependencies and force rebuild all affected locales", async () => {
    await withTemporaryDirectory(async (root) => {
        const { directory } = await fixture(root);
        await buildContents({ root, ...quiet });
        await writeFile(join(directory, "source/en.txt"), "Changed English");
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en"]);
        await writeFile(join(root, "shared.txt"), "Changed shared input");
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en", "first/zh-tw"]);
        await writeFile(join(directory, "pnpm-lock.yaml"), "changed-lock");
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en", "first/zh-tw"]);
        assert.deepEqual(built(await buildContents({ root, force: true, ...quiet })), ["first/en", "first/zh-tw"]);
        await rm(join(root, ".cache/content-build"), { recursive: true });
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en", "first/zh-tw"]);
    });
});

test("item, section and locale selection share one builder and multiple placements never duplicate builds", async () => {
    await withTemporaryDirectory(async (root) => {
        await fixture(root);
        await fixture(root, "second", ["playground"]);
        assert.deepEqual(built(await buildContents({ root, section: "projects", locale: "en", ...quiet })), ["first/en"]);
        assert.deepEqual(built(await buildContents({ root, item: "second", ...quiet })), ["second/en", "second/zh-tw"]);
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/zh-tw"]);
        await assert.rejects(buildContents({ root, item: "unknown", ...quiet }), /Unknown content/);
        await assert.rejects(buildContents({ root, section: "unknown", ...quiet }), /No content in section/);
        await assert.rejects(buildContents({ root, locale: "unknown", ...quiet }), /No selected content for locale/);
        assert.equal(buildOptions(["--item", "second", "--force"]).force, true);
        assert.equal(buildOptions(["--item=", "--locale="]).locale, "");
        assert.throws(() => buildOptions(["--unknown"]));
    });
});

for (const native of [false, true]) {
    test(`CI runs ${native ? "native" : "JavaScript"} pnpm once per changed project and never for cache hits`, async (context) => {
        const previous = process.env.npm_execpath;
        context.after(() => {
            if (previous === undefined) delete process.env.npm_execpath;
            else process.env.npm_execpath = previous;
        });
        await withTemporaryDirectory(async (root) => {
            const { directory } = await fixture(root, "first", ["documentations"]);
            await writeFile(join(directory, "package.json"), '{"type":"commonjs"}');
            const executable = join(root, native ? (process.platform === "win32" ? "pnpm.exe" : "pnpm") : "pnpm.cjs");
            if (native) await cp(process.execPath, executable);
            const installer = native ? join(directory, "install") : executable;
            const args = native ? ["--frozen-lockfile"] : ["install", "--frozen-lockfile"];
            await writeFile(installer, `require("node:assert/strict").deepEqual(process.argv.slice(2), ${JSON.stringify(args)});
require("node:fs").appendFileSync("installs.txt", "installed\\n");
`);
            process.env.npm_execpath = executable;
            assert.deepEqual(built(await buildContents({ root, install: true, ...quiet })), ["first/en", "first/zh-tw"]);
            assert.equal(await readFile(join(directory, "installs.txt"), "utf8"), "installed\n");
            await buildContents({ root, install: true, run: () => assert.fail("Cache hits must not install or build"), ...quiet });
        });
    });
}

test("failed or incomplete builds keep previous outputs and success records, and removed targets leave no reusable cache", async () => {
    await withTemporaryDirectory(async (root) => {
        const { directory } = await fixture(root);
        await buildContents({ root, ...quiet });
        const manifest = join(root, ".cache/content-build/first/en/manifest.json");
        const previous = await readFile(manifest, "utf8");
        for (const text of ["fail", "no-index"]) {
            await writeFile(join(directory, "source/en.txt"), text);
            await assert.rejects(buildContents({ root, ...quiet }), /Command failed|did not produce index/);
            assert.equal(await readFile(join(directory, "build/en/index.html"), "utf8"), "<h1>English</h1>");
            assert.equal(await readFile(manifest, "utf8"), previous);
        }
        assert.ok((await readdir(join(root, ".cache/content-build"))).every((name) => ! name.startsWith(".build-")));
        await rm(join(directory, "configs.json"));
        await buildContents({ root, ...quiet });
        assert.deepEqual(await readdir(join(root, ".cache/content-build/first")), []);
    });
});

test("cache corruption rebuilds, changed inputs during compilation fail, and outputs cannot overwrite sources", async () => {
    await withTemporaryDirectory(async (root) => {
        const { directory, config } = await fixture(root);
        await buildContents({ root, ...quiet });
        await writeFile(join(root, ".cache/content-build/first/en/output/asset.txt"), "corrupted cache");
        assert.deepEqual(built(await buildContents({ root, ...quiet })), ["first/en"]);
        await assert.rejects(buildContents({ root, force: true, ...quiet, run: async (command, cwd) => {
            runCommand(command, cwd);
            await writeFile(join(directory, "source/en.txt"), "edited during build");
        } }), /changed during build/);
        assert.equal(await readFile(join(directory, "build/en/index.html"), "utf8"), "<h1>English</h1>");
        config.locales.en.entry.root = "./source";
        await writeFile(join(directory, "configs.json"), JSON.stringify(config));
        await assert.rejects(buildContents({ root, ...quiet }), /input overlaps output/);
        assert.equal(await readFile(join(directory, "source/en.txt"), "utf8"), "edited during build");
    });
});
