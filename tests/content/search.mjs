import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSearchIndex, discoveryIndex, readSearchState, searchParameters, searchTerms, searchSnippet, searchFilterOptions, searchSourceKey } from "../../src/data/search.ts";
import { filterDiscoveryOptions, initializeDiscovery, initializeSearch } from "../../src/scripts/search.ts";
import { createListSearch } from "../../src/scripts/list_search.ts";
import { getSourceSearchDocuments } from "../../src/services/sources.ts";
import { useMessages } from "../../src/i18n/ui.ts";
import { searchPolicy } from "../../src/config/search.ts";
import { defaultLocale } from "../../src/config/locales.ts";
import { searchText } from "../../src/utils/search_text.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { buildSiteFixture, configuration, copySiteFixture, writeItem } from "./fixture.mjs";
import { installGlobals, textElement } from "../fixture.mjs";

const document = (id, data = {}) => ({ id, data: {
    locale: defaultLocale, placements: ["blog"], category: "category-a", tags: [],
    title: id, description: "", body: "", href: `/${id}/`, sources: [], date: "2026-01-01", dateKind: "published", ...data,
} });
const state = (values = {}) => ({ ...readSearchState(new URLSearchParams()), ...values });

test("source registration supplies search documents and labels without a separate provider list", () => {
    const definitions = {
        gitea: { title: "Self-hosted Git", search: () => [{ id: "repository:one", data: {
            title: "Example", href: "https://git.example.test/one", date: "2026-01-01", dateKind: "updated", placements: ["playground"],
        } }] },
        nas: { title: "NAS" },
    };
    const items = getSourceSearchDocuments(definitions);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "gitea:repository:one");
    assert.deepEqual(items[0].data.sources, [definitions.gitea.title]);
    assert.deepEqual(searchFilterOptions(items).sections, ["playground"]);
    definitions.gitea.title = "Renamed Git";
    definitions.cycu = { title: "CYCU", search: () => [{ id: "project", data: {
        ...items[0].data, sources: ["CYCU", "NAS"], placements: ["studying", "projects"],
    } }] };
    const updated = getSourceSearchDocuments(definitions);
    assert.deepEqual(updated.map(({ id }) => id), ["gitea:repository:one", "cycu:project"]);
    assert.deepEqual(searchFilterOptions(updated).sources.map(({ title }) => title), ["CYCU", "NAS", "Renamed Git"]);
    assert.deepEqual(createSearchIndex(updated)(state({ source: searchSourceKey("NAS"), section: "studying" }), defaultLocale).map(({ document }) => document.id), ["cycu:project"]);
});

test("local search reuses global tokens while keeping AND matching, reset and caller-owned filters", () => {
    const rows = ["Piano Touhou cafe\u0301 C++", "Piano", "Touhou"].map((title, index) => Object.assign(textElement(title), {
        dataset: { search: title, language: index ? "JavaScript" : "C++" },
    }));
    const input = Object.assign(new EventTarget(), { value: "" });
    const controls = { hidden: true };
    const root = { querySelector: (selector) => selector === "[data-list-search]" ? input : controls };
    let updates = 0;
    const local = createListSearch(root, rows, () => updates++);
    const global = createSearchIndex(rows.map((row, index) => document(String(index), { title: row.dataset.search })));
    for (const query of ["piano touhou", "PIANO, touhou", "piano,touhou"]) {
        input.value = query;
        input.dispatchEvent(new Event("input"));
        assert.deepEqual(rows.filter(local.matches), [rows[0]]);
        assert.equal(global(state({ query }), defaultLocale).length, 3);
    }
    input.value = "CAFÉ C++";
    input.dispatchEvent(new Event("input"));
    assert.deepEqual(rows.filter((row) => row.dataset.language === "C++" && local.matches(row)), [rows[0]]);
    local.highlight(rows[0]);
    assert.deepEqual(rows[0].querySelectorAll("mark").map((mark) => mark.textContent), ["cafe\u0301", "C++"]);
    local.reset();
    assert.equal(input.value, "");
    assert.equal(local.active, false);
    assert.equal(updates, 5);
    assert.equal(rows.filter(local.matches).length, 3);
    local.highlight(rows[0]);
    assert.equal(rows[0].querySelectorAll("mark").length, 0);
    assert.equal(controls.hidden, false);
});

function discoveryFixture(defaults = {}) {
    const form = Object.assign(new EventTarget(), { action: "https://example.test/search/" });
    const clear = new EventTarget();
    const summary = { category: {}, tag: {} };
    const groups = ["category", "tag"].map((kind) => {
        const input = Object.assign(new EventTarget(), { value: "" });
        const empty = {};
        const values = kind === "category" ? ["", "health", "music"] : ["tag-a", "tag-b", "tag-c"];
        const controls = values.map((value) => ({ name: kind, value, checked: false }));
        const rows = controls.filter(({ value }) => value).map((control) => {
            const title = textElement(control.value);
            return { dataset: { filterLabel: control.value }, hidden: false, querySelector: (selector) => selector === "input" ? control : title };
        });
        return {
            kind, input, controls, rows, open: true,
            querySelector: (selector) => selector === "[data-filter-search]" ? input : empty,
            querySelectorAll: () => rows,
        };
    });
    form.querySelectorAll = (selector) => groups.find(({ kind }) => selector === `[name="${kind}"]`).controls;
    const nodes = { "[data-discovery-form]": form, "[data-clear-tags]": clear, "[data-category-summary]": summary.category, "[data-tags-summary]": summary.tag };
    const rail = {
        dataset: { locale: defaultLocale, copy: JSON.stringify(useMessages(defaultLocale).search), defaultFilters: JSON.stringify(defaults) },
        querySelector: (selector) => nodes[selector], querySelectorAll: () => groups,
    };
    return {
        rail, groups, summary, clear,
        change(kind, value, checked = true) {
            const target = groups.find((group) => group.kind === kind).controls.find((control) => control.value === value);
            target.checked = checked;
            const event = new Event("change");
            Object.defineProperty(event, "target", { value: target });
            form.dispatchEvent(event);
        },
    };
}

test("discovery works without a header and each embedded controller keeps its own selection", (context) => {
    const wide = Object.assign(new EventTarget(), { matches: false });
    installGlobals(context, {
        window: { matchMedia: () => wide },
        location: { search: "", href: "https://example.test/playground/" },
    });
    const first = discoveryFixture({ category: "health", tags: ["tag-a"] });
    const second = discoveryFixture({ category: "music" });
    const changes = [];
    const one = initializeDiscovery(first.rail, (filters) => changes.push(filters));
    const two = initializeDiscovery(second.rail, () => assert.fail("Unrelated widget must not change."));
    assert.equal(initializeDiscovery(first.rail), one);
    first.change("tag", "tag-b");
    assert.deepEqual(one.filters, { category: "health", tags: ["tag-a", "tag-b"] });
    assert.deepEqual(two.filters, { category: "music", tags: [] });
    assert.equal(changes.length, 1);
    first.groups[0].input.value = "music";
    first.groups[0].input.dispatchEvent(new Event("input"));
    assert.deepEqual(first.groups[0].rows.map((row) => row.hidden), [false, false]);
    first.change("category", "music");
    assert.equal(first.summary.category.textContent, "music");
    assert.equal(first.groups[0].rows[0].hidden, true);
    first.clear.dispatchEvent(new Event("click"));
    assert.deepEqual(one.filters.tags, []);
    assert.equal(changes.length, 3);
    assert.ok(first.groups.every((group) => ! group.open));
    wide.matches = true;
    wide.dispatchEvent(new Event("change"));
    assert.ok([...first.groups, ...second.groups].every((group) => group.open));
});

test("standalone discovery navigation preserves query and other filters without global search markup", (context) => {
    const view = discoveryFixture();
    const destinations = [];
    installGlobals(context, {
        document: { querySelector: () => null, querySelectorAll: () => [view.rail] },
        window: { matchMedia: () => Object.assign(new EventTarget(), { matches: true }) },
        location: { href: "https://example.test/playground/", search: "?q=piano&section=projects&source=external%3ANAS&sort=oldest", assign: (value) => destinations.push(value) },
    });
    initializeSearch();
    initializeSearch();
    view.change("category", "health");
    assert.equal(destinations.length, 1);
    const destination = new URL(destinations[0]);
    assert.equal(destination.pathname, "/search/");
    assert.deepEqual(readSearchState(destination.searchParams), state({ query: "piano", section: "projects", source: "external:NAS", sort: "oldest", category: "health" }));
});

test("section and source options follow published data and intersect all other filters", () => {
    const items = [
        document("A", { sources: ["Gitea"], placements: ["projects", "feeds"], title: "needle", tags: ["a", "b", "c"] }),
        document("B", { sources: ["Gitea"], placements: ["projects"], title: "needle", tags: ["a", "b"] }),
        document("C", { sources: ["NAS"], placements: ["playground"], title: "needle", tags: ["a", "b", "c"] }),
        document("local", { placements: ["playground"], tags: ["a"] }),
        document("external-local", { sources: ["local"], placements: ["projects"] }),
        document("draft", { sources: ["Draft"], placements: ["draft-only"], draft: true }),
    ];
    assert.deepEqual(searchFilterOptions(items), {
        sections: ["feeds", "playground", "projects"],
        sources: [
            { value: "local", title: "" },
            { value: "external:Gitea", title: "Gitea" },
            { value: "external:NAS", title: "NAS" },
            { value: "external:local", title: "local" },
        ],
    });
    assert.ok(searchFilterOptions([...items, document("new", { sources: ["CYCU"], placements: ["new-section"] })]).sections.includes("new-section"));
    assert.ok(searchFilterOptions([...items, document("new", { sources: ["CYCU"] })]).sources.some(({ title }) => title === "CYCU"));
    const search = createSearchIndex(items);
    const ids = (values) => search(state(values), defaultLocale).map(({ document }) => document.id);
    const filter = { section: "projects", source: searchSourceKey("Gitea"), category: "category-a", tags: ["a", "b"], query: "needle", from: "2026-01-01", to: "2026-01-01" };
    assert.deepEqual(ids(filter), ["A", "B"]);
    assert.deepEqual(ids({ ...filter, tags: ["a", "b", "c"] }), ["A"]);
    assert.deepEqual(ids({ ...filter, section: "feeds" }), ["A"]);
    assert.deepEqual(ids({ ...filter, source: searchSourceKey("NAS") }), []);
    assert.deepEqual(ids({ ...filter, section: "playground", source: searchSourceKey("NAS") }), ["C"]);
    assert.deepEqual(ids({ ...filter, from: "2026-01-02" }), []);
    assert.deepEqual(ids({ ...filter, category: "other" }), []);
    assert.deepEqual(ids({ section: "playground", source: searchSourceKey("") }), ["local"]);
    assert.deepEqual(ids({ source: searchSourceKey("local") }), ["external-local"]);
    assert.deepEqual(ids({ source: "external:missing" }), []);
    assert.deepEqual(ids({ section: "missing" }), []);
});

test("multiple sections and sources remain independent memberships with automatically discovered options", () => {
    const items = [
        document("shared", { placements: ["projects", "playground", "playground"], sources: ["Gitea", "CYCU", "CYCU"], tags: ["a", "b"], title: "needle" }),
        document("other", { placements: ["feeds"], sources: ["CYCU"] }),
        document("local"),
        document("mixed", { sources: ["", "NAS"] }),
    ];
    assert.deepEqual(searchFilterOptions(items), {
        sections: ["blog", "feeds", "playground", "projects"],
        sources: [
            { value: "local", title: "" },
            { value: "external:CYCU", title: "CYCU" },
            { value: "external:Gitea", title: "Gitea" },
            { value: "external:NAS", title: "NAS" },
        ],
    });
    const search = createSearchIndex(items);
    const ids = (values) => search(state(values), defaultLocale).map(({ document }) => document.id);
    for (const section of ["projects", "playground"]) {
        for (const source of ["Gitea", "CYCU"]) {
            assert.deepEqual(ids({ section, source: searchSourceKey(source), query: "needle", category: "category-a", tags: ["a", "b"], from: "2026-01-01", to: "2026-01-01" }), ["shared"]);
        }
    }
    assert.deepEqual(ids({ source: searchSourceKey("CYCU") }).sort(), ["other", "shared"]);
    assert.deepEqual(ids({ section: "feeds", source: searchSourceKey("Gitea") }), []);
    assert.deepEqual(ids({ source: searchSourceKey("Gitea"), tags: ["missing"] }), []);
    assert.deepEqual(ids({ source: searchSourceKey("") }).sort(), ["local", "mixed"]);
    assert.deepEqual(ids({ source: searchSourceKey("NAS") }), ["mixed"]);
    assert.equal(ids({}).length, items.length);
});

test("category and tag list search shares Unicode matching without truncating options or changing selection", () => {
    for (const kind of ["category", "tag"]) {
        const input = { value: "" };
        const empty = { hidden: true };
        const rows = ["Health", "鋼琴", "ピアノ", "C++", "cafe\u0301", ...Array.from({ length: 12 }, (_, index) => "option-" + index)].map((name) => {
            const checkbox = { checked: false };
            const title = textElement(name);
            return { dataset: { filterLabel: name }, hidden: false, checkbox, title, querySelector: (selector) => selector === "input" ? checkbox : title };
        });
        const group = {
            dataset: { filterGroup: kind },
            querySelector: (selector) => selector === "[data-filter-search]" ? input : empty,
            querySelectorAll: () => rows,
        };
        const visible = (query) => {
            input.value = query;
            filterDiscoveryOptions(group);
            return rows.filter((row) => ! row.hidden).map((row) => row.dataset.filterLabel);
        };
        assert.equal(visible("").length, 17);
        for (const [query, expected] of [[" HEALTH ", "Health"], ["琴", "鋼琴"], ["アノ", "ピアノ"], ["++", "C++"], ["CAFÉ", "cafe\u0301"], ["option-11", "option-11"]]) {
            assert.deepEqual(visible(query), [expected], kind);
            assert.ok(rows.find((row) => row.dataset.filterLabel === expected).title.querySelectorAll("mark").length > 0);
        }
        assert.deepEqual(visible("missing"), []);
        assert.equal(empty.hidden, false);
        rows[0].checkbox.checked = true;
        assert.deepEqual(visible("ピアノ"), ["Health", "ピアノ"]);
        assert.equal(rows[0].checkbox.checked, true);
        assert.equal(empty.hidden, true);
        rows[0].checkbox.checked = false;
        assert.equal(visible("").length, 17);
        assert.ok(rows.every((row) => row.title.querySelectorAll("mark").length === 0));
    }
});

test("one category and every selected tag apply together without dropping incompatible selections", () => {
    const items = [
        document("A", { tags: ["tag-a", "tag-b", "tag-c"] }),
        document("B", { tags: ["tag-a", "tag-b"] }),
        document("C", { category: "category-b", tags: ["tag-c"] }),
        document("draft", { tags: ["tag-c"], draft: true }),
    ];
    const search = createSearchIndex(items);
    const ids = (values) => search(state(values), defaultLocale).map(({ document }) => document.id);
    assert.deepEqual(ids({ category: "category-a" }), ["A", "B"]);
    assert.deepEqual(ids({ category: "category-a", tags: ["tag-a", "tag-b"] }), ["A", "B"]);
    assert.deepEqual(ids({ category: "category-a", tags: ["tag-c"] }), ["A"]);
    assert.deepEqual(ids({ category: "category-a", tags: ["tag-a", "tag-b", "tag-c"] }), ["A"]);
    assert.deepEqual(ids({ category: "missing", tags: ["tag-c"] }), []);
    assert.deepEqual(ids({ tags: ["tag-c"] }), ["A", "C"]);
});

test("BM25 uses field weights, term saturation and length normalization independently of dates", () => {
    const items = [document("title", { title: "piano" }), document("body", { title: "other", body: "piano", date: "2026-10-01" })];
    const results = createSearchIndex(items)(state({ query: "piano" }), defaultLocale);
    assert.equal(results[0].document.id, "title");
    const expected = searchPolicy.weights.title * Math.log(1 + (2 - 1 + 0.5) / (1 + 0.5));
    assert.ok(Math.abs(results[0].score - expected) < 1e-10);
    const repeated = createSearchIndex([document("one", { body: "piano" }), document("many", { body: "piano ".repeat(100) })])(state({ query: "piano" }), defaultLocale);
    assert.ok(repeated[0].score / repeated[1].score < 3);
    const long = createSearchIndex([document("short", { body: "piano" }), document("long", { body: "piano " + "noise ".repeat(100) })])(state({ query: "piano" }), defaultLocale);
    assert.equal(long[0].document.id, "short");
});

test("Unicode words, symbol names and URL filters retain their meaning", () => {
    for (const word of ["C++", "C#", ".NET", "Node.js", "CI/CD", "鋼琴", "ピアノ", "العربية", "🧑‍💻"]) {
        const results = createSearchIndex([document("match", { title: word })])(state({ query: word }), defaultLocale);
        assert.equal(results.length, 1, word);
    }
    assert.ok(searchTerms("Learn C++? C++教學").includes("c++"));
    const original = state({ query: "C++ 鋼琴", section: "playground", source: searchSourceKey("NAS"), category: "category-a", tags: ["C++", "鋼琴", "#"], sort: "newest", from: "2026-01-01" });
    assert.deepEqual(readSearchState(searchParameters(original)), original);
    assert.equal(readSearchState(new URLSearchParams("sort=unknown&from=bad")).sort, "relevance");
    assert.equal(readSearchState(new URLSearchParams("sort=unknown&from=bad")).from, "");
});

test("substring queries match prefixes, middles and suffixes without case sensitivity", () => {
    const item = document("mymusic5", { title: "LunaticGhoulPiano/MyMusic5API", description: "MyMusic5 API using GraphQL" });
    const search = createSearchIndex([item, document("unrelated", { title: "Piano music" })]);
    for (const query of ["QL", "Ql", "ql", "Q", "q", "Graph", "raphQ", "sic5A", "5API"]) {
        assert.deepEqual(search(state({ query }), defaultLocale).map(({ document }) => document.id), ["mymusic5"], query);
        assert.ok(search(state({ query }), defaultLocale)[0].score > 0, query);
    }
    assert.deepEqual(search(state({ query: "notpresent" }), defaultLocale), []);
    assert.ok(searchSnippet(item, "Ql").includes("GraphQL"));
});

test("substring matches include symbols and multilingual text across word boundaries in every field", () => {
    for (const [text, query] of [["GraphQL", "QL"], ["C++", "++"], ["C#", "#"], ["Node.js", ".js"], ["CI/CD", "/"], ["鋼琴演奏", "琴演"], ["ピアノ演奏", "ノ演"], ["cafe\u0301", "FÉ"]]) {
        for (const field of ["title", "description", "body", "category", "tags"]) {
            const item = document("match", { [field]: field === "tags" ? [text] : text });
            assert.equal(createSearchIndex([item])(state({ query }), defaultLocale).length, 1, `${field}: ${query}`);
        }
    }
});

test("BM25 discounts partial occurrences while filters and explicit date sorting still apply", () => {
    const items = [
        document("partial", { title: "GraphQL", date: "2026-10-01", tags: ["tag-a", "tag-b"] }),
        document("exact", { title: "QL", date: "2026-01-01", tags: ["tag-a"] }),
        document("draft", { title: "GraphQL", draft: true }),
    ];
    const search = createSearchIndex(items);
    const results = search(state({ query: "QL" }), defaultLocale);
    assert.deepEqual(results.map(({ document }) => document.id), ["exact", "partial"]);
    assert.ok(results[0].score > results[1].score);
    assert.deepEqual(search(state({ query: "Ql", sort: "newest" }), defaultLocale).map(({ document }) => document.id), ["partial", "exact"]);
    assert.deepEqual(search(state({ query: "Ql", category: "category-a", tags: ["tag-a", "tag-b"], from: "2026-09-01" }), defaultLocale).map(({ document }) => document.id), ["partial"]);
    assert.deepEqual(search(state({ query: "Ql", category: "category-b" }), defaultLocale), []);
    assert.deepEqual(search(state({ query: "Ql", tags: ["tag-c"] }), defaultLocale), []);
    assert.deepEqual(search(state({ query: "Ql", from: "2026-10-02" }), defaultLocale), []);
});

test("results deduplicate identities, include other languages and sort by content dates", () => {
    const items = [
        document("same", { locale: "en", title: "piano", placements: ["projects", "feeds"] }),
        document("same", { locale: "zh-tw", title: "鋼琴", placements: ["projects", "feeds"] }),
        document("new", { title: "piano", date: "2026-02-01" }),
        document("updated", { date: "2025-01-01", updated: "2026-10-01" }),
    ];
    const search = createSearchIndex(items);
    assert.equal(search(state(), "zh-tw").filter(({ document }) => document.id === "same").length, 1);
    assert.equal(search(state({ query: "鋼琴" }), "en")[0].document.data.locale, "zh-tw");
    assert.equal(search(state({ sort: "oldest" }), "en")[0].document.id, "updated");
    assert.equal(search(state({ sort: "updated" }), "en")[0].document.id, "updated");
    assert.deepEqual(search(state({ from: "2026-01-02" }), "en").map(({ document }) => document.id), ["new"]);
    assert.equal(discoveryIndex(items, "en").categories[0].count, 3);
});

test("visible HTML and snippets exclude executable and navigation text", () => {
    assert.equal(searchText('<head>Secret</head><nav>Navigation</nav><main><h1>C++ &amp; 鋼琴</h1><script>secret()</script><style>.private{}</style><p>Visible &#65;</p></main>'), "C++ & 鋼琴 Visible A");
    assert.ok(searchSnippet(document("body", { description: "Unrelated", body: "Some searchable piano text" }), "piano").includes("piano"));
});

test("built search covers each content type without changing independent page styles or exposing drafts", async () => {
    await withTemporaryDirectory(async (root) => {
        await copySiteFixture(root);
        await writeItem(root, configuration("article", { type: "markdown", file: "./body.md", path: "/notes/article/" }, { tags: ["tag-a", "tag-b", "tag-c"] }), { "body.md": "## Heading\n\nMarkdown needleword." });
        await writeItem(root, configuration("custom", { type: "astro", file: "./Page.astro", path: "/custom/" }), {
            "Page.astro": '<!doctype html><html><head><style>body{background:red}</style></head><body><main>Rendered astroneedle</main><script is:inline>const secret="notsearchable";</script></body></html>',
        });
        await writeItem(root, configuration("site", { type: "site", root: "./output", path: "/docs/site/" }), {
            "output/index.html": "<main>Site needle</main>",
            "output/guide/index.html": "<main>Nested guideneedle</main>",
        });
        const draft = configuration("secret");
        draft.locales[defaultLocale].draft = true;
        await writeItem(root, draft);
        const build = buildSiteFixture(root);
        assert.equal(build.status, 0, build.stdout + build.stderr);
        const index = JSON.parse(await readFile(join(root, "dist/search-index.json"), "utf8"));
        const search = createSearchIndex(index);
        for (const [query, id] of [["needleword", "article"], ["astroneedle", "custom"], ["guideneedle", "site"]]) {
            assert.equal(search(state({ query }), defaultLocale)[0].document.id, `content:${id}`);
        }
        assert.doesNotMatch(JSON.stringify(index), /notsearchable|content:secret|src\/contents|background:red/);
        const custom = await readFile(join(root, "dist/custom/index.html"), "utf8");
        assert.doesNotMatch(custom, /data-discovery|data-global-search/);
        for (const path of ["search", "blog", "projects"]) {
            const html = await readFile(join(root, "dist", path, "index.html"), "utf8");
            assert.match(html, /data-global-search/);
            assert.match(html, /data-discovery/);
            assert.equal([...html.matchAll(/data-filter-search/g)].length, 2);
            if (path === "search") {
                const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
                assert.doesNotMatch(main, /name="category"|name="tag"/);
                assert.match(main, /Similarity \(BM25\)/);
                assert.match(main, /name="section" data-search-section/);
                assert.match(main, /name="source" data-search-source/);
            }
        }
    });
});
