import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { itemConfigSchema } from "../../src/data/contents_schema.ts";
import { tagName, getTaxonomyIndex, getTaxonomyItems } from "../../src/data/taxonomy.ts";
import { tagPath, categoryPath } from "../../src/routing.ts";
import { defaultLocale, locales, localizedPath } from "../../src/config/locales.ts";
import { discoverContent } from "../../scripts/content/loader.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { buildSiteFixture, configuration, copySiteFixture, writeItem } from "./fixture.mjs";

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

test("taxonomy links preserve Unicode and symbols in localized search filters without standalone routes", () => {
    const paths = names.map((name) => tagPath(name, defaultLocale));
    assert.equal(new Set(paths).size, names.length);
    for (const name of [...names, "鋼琴".repeat(200)]) {
        for (const locale of locales) {
            const url = new URL(tagPath(name, locale, "projects"), "https://example.test/");
            assert.equal(url.pathname, localizedPath("search", locale));
            assert.equal(url.searchParams.get("tag"), name);
            assert.equal(url.searchParams.get("section"), "projects");
            assert.equal(url.hash, "");
        }
    }
    const category = new URL(categoryPath("health", defaultLocale), "https://example.test/");
    assert.equal(category.pathname, localizedPath("search", defaultLocale));
    assert.equal(category.searchParams.get("category"), "health");
});

test("sidebar lists every published category and tag with deduplicated counts and no standalone pages", async () => {
    await withTemporaryDirectory(async (root) => {
        await copySiteFixture(root);
        const first = configuration("first", undefined, { tags: [...names, "C++"], placements: ["blog", "projects"] });
        for (const locale of locales) first.locales[locale] = { ...first.locales[defaultLocale], title: "First " + locale };
        await writeItem(root, first);
        const second = configuration("second", { type: "link", url: "https://example.test/second/" }, {
            tags: ["C++", "鋼琴"], placements: ["projects"],
        });
        await writeItem(root, second, {});
        for (let index = 0; index < 12; index++) {
            await writeItem(root, configuration("category-" + index, { type: "link", url: "https://example.test/" + index }, {
                category: "category-" + index,
            }), {});
        }
        const draft = configuration("draft", { type: "link", url: "https://example.test/draft/" }, { tags: ["C++", "draft-only"], category: "draft-category" });
        draft.locales[defaultLocale].draft = true;
        await writeItem(root, draft, {});
        const records = await discoverContent(root);
        assert.equal(records.find((item) => item.data.itemId === "first").data.tags.filter((name) => name === "C++").length, 1);

        const result = buildSiteFixture(root);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const output = join(root, "dist");
        const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
        const decode = (value) => value?.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
        for (const locale of locales) {
            const html = await readFile(join(output, localizedPath("search", locale), "index.html"), "utf8");
            assert.doesNotMatch(html, /draft-only|draft-category|View all|查看全部/);
            const tagGroup = html.match(/<details\b[^>]*data-filter-group="tag"[^>]*>([\s\S]*?)<\/details>/)[1];
            const categoryGroup = html.match(/<details\b[^>]*data-filter-group="category"[^>]*>([\s\S]*?)<\/details>/)[1];
            const rows = [...tagGroup.matchAll(/<label\b[^>]*data-filter-option[^>]*>([\s\S]*?)<\/label>/g)].map((match) => match[1]);
            assert.equal(rows.length, names.length);
            for (const name of names) {
                const row = rows.find((row) => decode(row.match(/name="tag" value="([^"]*)"/)?.[1]) === name);
                assert.ok(row, name);
                const expected = ["C++", "鋼琴"].includes(name) ? 2 : 1;
                assert.ok(row.includes('class="taxonomy-count">' + expected + "</span>"), row);
            }
            assert.equal([...categoryGroup.matchAll(/data-filter-option/g)].length, 13);
            for (const group of [tagGroup, categoryGroup]) {
                assert.match(group, /data-filter-search/);
                assert.match(group, /class="discovery-options"/);
                assert.doesNotMatch(group, /data-filter-option[^>]*\bhidden\b/);
            }
            const article = await readFile(join(output, localizedPath("blog/sample", locale), "index.html"), "utf8");
            assert.ok(article.includes(escape(tagPath("C++", locale, "blog"))));
            assert.ok(article.includes(escape(categoryPath("development", locale, "blog"))));
        }
        const files = await readdir(output, { recursive: true });
        assert.equal(files.some((file) => /(^|[\\/])(tags|categories)([\\/]|$)/.test(file)), false);
        const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
        assert.doesNotMatch(sitemap, /\/(?:tags|categories)\//);
    });
});
