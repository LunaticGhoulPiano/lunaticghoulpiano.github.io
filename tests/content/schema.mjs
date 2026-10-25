import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, unlink, rename, symlink } from "node:fs/promises";
import { join } from "node:path";
import { itemConfigSchema, contentUrlSchema, published } from "../../src/data/contents_schema.ts";
import { discoverContent, validateEntries } from "../../scripts/content/loader.mjs";
import { getPageEntries, contentPath } from "../../src/routing.ts";
import { locales, defaultLocale, localizedPath } from "../../src/config/locales.ts";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { configuration, writeItem } from "./fixture.mjs";

test("configs defaults, real dates, supported languages and entry-specific fields are validated", () => {
    const input = configuration();
    delete input.schemaVersion;
    delete input.locales[defaultLocale].draft;
    const parsed = itemConfigSchema.parse(input);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.locales[defaultLocale].draft, true);
    assert.deepEqual(parsed.tags, []);
    for (const date of ["2026-02-30", "yesterday"]) {
        assert.equal(itemConfigSchema.safeParse({ ...input, locales: { [defaultLocale]: { ...input.locales[defaultLocale], date } } }).success, false);
    }
    for (const change of [
        { locales: {} }, { locales: { unsupported: input.locales[defaultLocale] } }, { schemaVersion: 2 },
        { id: "../outside" }, { placements: ["unknown"] },
        { locales: { [defaultLocale]: { ...input.locales[defaultLocale], updated: "2026-10-24" } } },
    ]) assert.equal(itemConfigSchema.safeParse({ ...input, ...change }).success, false);
    for (const entry of [
        { type: "markdown", file: "../body.md", path: "/blog/example/" },
        { type: "markdown", file: "./folder/../../body.md", path: "/blog/example/" },
        { type: "astro", file: "./body.md", path: "/demo/" },
        { type: "link", url: "/demo/", file: "./body.md" },
        { type: "site", root: "./docs", path: "/docs/", engine: "shell" },
        { type: "markdown", file: "./body.md", path: "/no-trailing-slash" },
    ]) assert.equal(itemConfigSchema.safeParse(configuration("sample", entry)).success, false);
});

test("only direct contents item configs are discovered; metadata survives renames without a second registration", async () => {
    await withTemporaryDirectory(async (root) => {
        assert.deepEqual(await discoverContent(root), []);
        await mkdir(join(root, "src/outside-item"), { recursive: true });
        await writeFile(join(root, "src/outside-item/configs.json"), "not valid JSON");
        assert.deepEqual(await discoverContent(root), []);
        const original = await writeItem(root);
        await mkdir(join(root, "src/contents/nested/ignored"), { recursive: true });
        await writeFile(join(root, "src/contents/nested/ignored/configs.json"), "not valid JSON");
        const before = await discoverContent(root);
        assert.equal(before.length, 1);
        assert.equal(before[0].id, `${defaultLocale}/sample`);
        assert.equal(before[0].data.directory, "src/contents/sample");
        assert.equal(before[0].data.source, "src/contents/sample/body.md");
        await rename(original, join(root, "src/contents/renamed-directory"));
        const after = await discoverContent(root);
        assert.equal(after[0].id, before[0].id);
        assert.equal(contentPath(after[0]), contentPath(before[0]));
        assert.equal(after[0].data.directory, "src/contents/renamed-directory");
        await unlink(join(root, "src/contents/renamed-directory/configs.json"));
        assert.deepEqual(await discoverContent(root), []);
    });
});

test("the same item can appear in multiple lists, with optional translations and independent entry types", async () => {
    await withTemporaryDirectory(async (root) => {
        const config = configuration("sample", { type: "link", url: "https://example.test/docs/" }, { placements: ["blog", "projects", "studying"] });
        for (const locale of locales) config.locales[locale] = { ...config.locales[defaultLocale] };
        await writeItem(root, config, {});
        const items = await discoverContent(root);
        assert.equal(items.length, locales.length);
        assert.ok(items.every((item) => item.data.href === "https://example.test/docs/"));
        assert.equal(getPageEntries(items).filter((page) => page.props.kind === "content").length, 0);
        const draft = structuredClone(items[0]);
        draft.data.draft = true;
        assert.deepEqual(published([draft]), []);
        assert.equal(getPageEntries([draft]).filter((page) => page.props.kind !== "page").length, 0);
    });
});

test("duplicate IDs, reserved routes, mounts, references and public references to drafts fail explicitly", async () => {
    await withTemporaryDirectory(async (root) => {
        await writeItem(root);
        const base = (await discoverContent(root))[0];
        assert.throws(() => validateEntries([base, base]), /Duplicate/);
        const second = structuredClone(base);
        second.id = `${defaultLocale}/second`;
        second.data.itemId = "second";
        assert.throws(() => validateEntries([base, second]), /Duplicate content route/);
        for (const path of ["/projects/", "/blog/tags/example/", "/blog/categories/example/"]) {
            second.data.entry.path = path;
            second.data.href = localizedPath(path, defaultLocale);
            assert.throws(() => validateEntries([second]), /Reserved/);
        }
        second.data.entry = { type: "site", engine: "static", root: "./built", path: "/blog/" };
        second.data.href = localizedPath("/blog/", defaultLocale);
        assert.throws(() => validateEntries([second, base]), /Reserved|overlap/);
        second.data.entry.path = "/blog/sample/child/";
        second.data.href = localizedPath(second.data.entry.path, defaultLocale);
        assert.throws(() => validateEntries([second, base]), /overlap/);
        base.data.related = ["missing"];
        assert.throws(() => validateEntries([base]), /Invalid content reference/);
        base.data.related = ["second"];
        second.data.entry = { type: "link", url: "https://example.test/" };
        second.data.draft = true;
        assert.throws(() => validateEntries([base, second]), /Invalid content reference/);
        second.data.draft = false;
        assert.doesNotThrow(() => validateEntries([base, second]));
        await writeItem(root, configuration("sample"), { "body.md": "duplicate" }, "duplicate");
        await assert.rejects(discoverContent(root), /Duplicate content ID/);
    });
});

test("missing files and frontmatter cannot publish", async () => {
    await withTemporaryDirectory(async (root) => {
        const target = await writeItem(root, configuration(), {});
        await assert.rejects(discoverContent(root), /ENOENT/);
        await writeFile(join(target, "body.md"), "---\ntitle: duplicated\n---\nContent");
        await assert.rejects(discoverContent(root), /configs.json, not Markdown/);
        await writeFile(join(target, "body.md"), "Valid content");
        assert.equal((await discoverContent(root)).length, 1);
    });
});

test("item folder names do not conflict with framework folders outside contents", async () => {
    await withTemporaryDirectory(async (root) => {
        await writeItem(root, configuration("components"), { "body.md": "Independent item" });
        const items = await discoverContent(root);
        assert.equal(items.length, 1);
        assert.equal(items[0].data.directory, "src/contents/components");
    });
});

test("entry symlinks cannot escape an item directory", async (context) => {
    await withTemporaryDirectory(async (root) => {
        const target = await writeItem(root);
        await mkdir(join(root, "outside"));
        await writeFile(join(root, "outside/secret.md"), "outside");
        try {
            await symlink(join(root, "outside"), join(target, "linked"), process.platform === "win32" ? "junction" : "dir");
        }
        catch (error) {
            if (error.code !== "EPERM") throw error;
            context.skip("This environment does not permit symlinks.");
            return;
        }
        await writeItem(root, configuration("sample", { type: "markdown", file: "./linked/secret.md", path: "/sample/" }), {});
        await assert.rejects(discoverContent(root), /symlink escapes/);
    });
});

test("content links reject executable, credential-bearing and ambiguous destinations", () => {
    for (const url of ["/games/demo/", "/demo/?mode=music#play", "https://docs.example.test/api/", "http://localhost:8080/"]) {
        assert.equal(contentUrlSchema.safeParse(url).success, true, url);
    }
    for (const url of ["", "//example.test/", "/\\example.test/", "javascript:alert(1)", "data:text/html,test", "file:///secret", "relative/path", "https://", "https://user:secret@example.test/", "https://example.test/\npath"]) {
        assert.equal(contentUrlSchema.safeParse(url).success, false, url);
    }
});
