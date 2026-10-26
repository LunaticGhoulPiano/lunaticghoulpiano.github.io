import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { itemConfigSchema } from "../../src/data/contents_schema.ts";
import { tagName, getTaxonomyIndex, getTaxonomyItems } from "../../src/data/taxonomy.ts";
import { tagSegment } from "../../src/utils/tag_segment.mjs";
import { tagPath, categoryPath } from "../../src/routing.ts";
import { defaultLocale, languages, locales, localizedPath } from "../../src/config/locales.ts";
import { discoverContent } from "../../scripts/content/loader.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { buildSiteFixture, configuration, copySiteFixture, writeItem, writeTaxonomyFixture } from "./fixture.mjs";

const names = [
    "piano", "C++", "C#", ".NET", "Node.js", "鋼琴", "ピアノ", "한국어", "العربية", "עברית",
    "हिन्दी", "Русский", "Ελληνικά", "é", "e\u0301", "فارسی\u200Cزبان", "🧑‍💻", "𠮷",
    "CI/CD", "A\\B", "?", "%", "#", "&", '<tag>', '"quoted"', ".", "..", "con", "aux",
    "CON", "C", "c", "nul", "prn", "com1", "lpt1", "foo.", "__proto__", "toString",
];

test("taxonomy APIs share filtering across tags, categories, languages and placements without requiring Astro records", () => {
    const items = [
        { id: "first", data: { locale: defaultLocale, placements: ["section-a", "section-b"], category: "development", tags: ["C++", "C++", "piano"] } },
        { id: "second", data: { locale: defaultLocale, placements: ["section-b"], category: "development", tags: ["C++", "radio"] } },
        { id: "third", data: { locale: defaultLocale, placements: ["section-a"], category: "music", tags: ["piano"] } },
        { id: "translated", data: { locale: locales.find((locale) => locale !== defaultLocale), placements: ["section-b"], category: "development", tags: ["C++"] } },
        { id: "draft", data: { locale: defaultLocale, placements: ["section-a"], category: "development", tags: ["C++"], draft: true } },
    ];
    const original = structuredClone(items);
    const index = (kind, placement) => Object.fromEntries(getTaxonomyIndex(items, { kind, locale: defaultLocale, placement })
        .map(({ value, count }) => [value, count]));
    assert.deepEqual(index("tag"), { "C++": 2, piano: 2, radio: 1 });
    assert.deepEqual(index("tag", "section-a"), { "C++": 1, piano: 2 });
    assert.deepEqual(index("category", "section-b"), { development: 2 });
    assert.deepEqual(index("tag", "missing"), {});
    const selected = getTaxonomyItems(items, { kind: "tag", value: "C++", locale: defaultLocale, placement: "section-a" });
    assert.deepEqual(selected, [items[0]]);
    assert.equal(selected[0], items[0]);
    assert.deepEqual(getTaxonomyItems(items, { kind: "category", value: "music", locale: defaultLocale }), [items[2]]);
    assert.deepEqual(getTaxonomyItems(items, { kind: "tag", value: "c++", locale: defaultLocale }), []);
    assert.deepEqual(items, original);
});

test("tags preserve Unicode languages, symbols, case and joining characters without a language whitelist", () => {
    const input = configuration("sample", undefined, { tags: names });
    assert.deepEqual(itemConfigSchema.parse(input).tags, names);
    for (const name of names) assert.equal(tagName(name, defaultLocale), name);
    for (const field of ["id", "category"]) {
        assert.equal(itemConfigSchema.safeParse({ ...input, [field]: "鋼琴" }).success, false);
    }
});

test("tags reject empty names, whitespace, controls and malformed Unicode instead of silently rewriting them", () => {
    const whitespace = [" ", "\t", "\n", "\r", "\r\n", "\v", "\f", "\u0085", "\u00a0", "\u1680", "\u2000", "\u2007", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff", "\u200b"];
    const invalid = ["", "Machine Learning", "鋼 琴", "\u0000", "\u001b", "\u007f", "\u009f", "\ud800", "\udc00"];
    for (const space of whitespace) invalid.push(`${space}tag`, `tag${space}`, `ta${space}g`);
    for (const name of invalid) {
        const input = configuration("sample", undefined, { tags: [name] });
        assert.equal(itemConfigSchema.safeParse(input).success, false, JSON.stringify(name));
        assert.equal(input.tags[0], name);
    }
});

test("tag routes remain stable, distinct and safe on case-insensitive filesystems while existing slugs stay unchanged", () => {
    const segments = names.map(tagSegment);
    assert.equal(new Set(segments.map((segment) => segment.toLowerCase())).size, names.length);
    assert.equal(tagSegment("machine-learning"), "machine-learning");
    assert.equal(tagSegment("C++"), tagSegment("C++"));
    assert.match(tagSegment("鋼琴".repeat(200)), /^~[a-f0-9]{64}$/);
    for (const name of names) {
        const segment = tagSegment(name);
        assert.match(segment, /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|~[a-f0-9]{64})$/);
        for (const locale of locales) {
            const path = tagPath(name, locale);
            const url = new URL(path, "https://example.test/");
            assert.equal(url.pathname, path);
            assert.equal(url.search + url.hash, "");
            assert.ok(path.endsWith(`/${segment}/`));
        }
    }
    assert.equal(categoryPath("development", defaultLocale), localizedPath("/blog/categories/development/", defaultLocale));
});

test("published tag indexes count each item once per language and link to built pages preserving the original names", async () => {
    await withTemporaryDirectory(async (root) => {
        await copySiteFixture(root);
        const first = configuration("first", undefined, { tags: [...names, "C++"], placements: ["blog", "projects"] });
        for (const locale of locales) first.locales[locale] = { ...first.locales[defaultLocale], title: `First ${locale}` };
        await writeItem(root, first);
        const second = configuration("second", { type: "link", url: "https://example.test/second/" }, {
            tags: ["C++", "鋼琴"], placements: ["projects"],
        });
        await writeItem(root, second, {});
        const draft = configuration("draft", { type: "link", url: "https://example.test/draft/" }, { tags: ["C++", "draft-only"] });
        draft.locales[defaultLocale].draft = true;
        await writeItem(root, draft, {});
        const records = await discoverContent(root);
        assert.equal(records.find((item) => item.data.itemId === "first").data.tags.filter((name) => name === "C++").length, 1);

        const result = buildSiteFixture(root);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const output = join(root, "dist");
        for (const locale of locales) {
            const index = await readFile(join(output, localizedPath("/blog/tags/", locale), "index.html"), "utf8");
            assert.match(index, /data-tag-search/);
            assert.match(index, /data-tag-empty/);
            assert.doesNotMatch(index, /draft-only/);
            const rows = [...index.matchAll(/<li\b[^>]*data-tag-entry[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
            assert.equal(rows.length, names.length);
            for (const name of names) {
                const path = tagPath(name, locale);
                const row = rows.find((row) => row.includes(`href="${path}"`));
                assert.ok(row, `${locale}: ${name}`);
                const expected = locale === defaultLocale && ["C++", "鋼琴"].includes(name) ? 2 : 1;
                assert.ok(row.includes(`<span>${expected}</span>`), row);
                const html = await readFile(join(output, path, "index.html"), "utf8");
                const escaped = name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
                assert.ok(html.includes(`<h1>${escaped}</h1>`), name);
                assert.ok(html.includes(`First ${locale}`), name);
                assert.equal(html.includes("https://example.test/second/"), expected === 2, name);
                assert.ok(html.includes(`rel="canonical" href="https://lunaticghoulpiano.github.io${path}"`), path);
            }
            const directories = await readdir(join(output, localizedPath("/blog/tags/", locale)));
            assert.equal(directories.filter((entry) => entry !== "index.html").length, names.length);
        }
    });
});

test("configured Projects mounts share taxonomy queries and components with global pages and embedded indexes", async () => {
    await withTemporaryDirectory(async (root) => {
        await copySiteFixture(root);
        await writeTaxonomyFixture(root);
        const result = buildSiteFixture(root);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const page = (path, locale = defaultLocale) => readFile(join(root, "dist", localizedPath(path, locale), "index.html"), "utf8");
        for (const locale of locales) {
            const index = await page("projects/topics", locale);
            assert.ok(index.includes(`href="${localizedPath(`projects/topics/${tagSegment("C++")}`, locale)}"`));
            assert.match(index, /C\+\+<\/a>\s*<span>1<\/span>/);
            assert.match(index, /shared<\/a>\s*<span>2<\/span>/);
            assert.doesNotMatch(index, /blog-only|draft-only|data-page-turner/);
            const global = await page("blog/tags", locale);
            assert.match(global, /C\+\+<\/a>\s*<span>2<\/span>/);
            const categories = await page("projects/categories", locale);
            assert.match(categories, /development<\/a>\s*<span>1<\/span>/);
            assert.match(categories, /music<\/a>\s*<span>1<\/span>/);
            assert.doesNotMatch(categories, />notes<|>unpublished<|data-page-turner/);
            const details = await page(`projects/topics/${tagSegment("C++")}`, locale);
            assert.ok(details.includes('href="https://example.test/first/"'));
            assert.doesNotMatch(details, /Outside scope|Unpublished fixture/);
            assert.ok(details.includes(`href="${localizedPath("projects/topics", locale)}"`));
            for (const language of locales) {
                assert.ok(details.includes(`hreflang="${languages[language].htmlLang}" href="https://lunaticghoulpiano.github.io${localizedPath(`projects/topics/${tagSegment("C++")}`, language)}"`));
            }
            const category = await page("projects/categories/development", locale);
            assert.ok(category.includes('href="https://example.test/first/"'));
            assert.doesNotMatch(category, /Outside scope/);
            const projects = await page("projects", locale);
            assert.ok(projects.includes(`href="${localizedPath("projects/topics", locale)}"`));
            assert.ok(projects.includes(`href="${localizedPath("projects/categories", locale)}"`));
        }
        const embedded = await page("taxonomy-fixture");
        assert.equal([...embedded.matchAll(/data-tag-browser/g)].length, 2);
        const sidebar = embedded.match(/<aside data-fixture-aside>([\s\S]*?)<\/aside>/)[1];
        assert.match(sidebar, /C\+\+<\/a>\s*<span>1<\/span>/);
        assert.doesNotMatch(sidebar, /blog-only/);
        const main = embedded.match(/<section data-fixture-main>([\s\S]*?)<\/section>/)[1];
        assert.match(main, /C\+\+<\/a>\s*<span>2<\/span>/);
        assert.match(main, /blog-only/);
        assert.doesNotMatch(embedded, /id="tag-search"/);
    });
});
