import { searchPolicy, searchSorts, type SearchSort } from "../config/search.ts";
import { selectContent, getTaxonomyIndex, type ClassifiedItem } from "./taxonomy.ts";
import type { Locale } from "../config/locales.ts";

export interface SearchDocument extends ClassifiedItem {
    id: string;
    data: ClassifiedItem["data"] & {
        title: string;
        description: string;
        body: string;
        href: string;
        sources: readonly string[];
        date: string;
        updated?: string;
        dateKind: "published" | "updated" | "event";
        entryType?: string;
    };
}

export interface SearchState {
    query: string;
    section: string;
    source: string;
    category: string;
    tags: string[];
    from: string;
    to: string;
    sort: SearchSort;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
export const normalizeSearchText = (value: string) => value.normalize("NFC").toLocaleLowerCase("und");

export function searchTerms(value: string): string[] {
    // Preserve punctuation inside technical names, while segmenting unspaced multilingual text.
    return normalizeSearchText(value).split(/\s+/u).filter(Boolean).flatMap((chunk) => {
        const part = chunk.replace(/^[\("'<]+|[\)"',;:!?]+$/gu, "") || chunk;
        const words: string[] = [];
        for (const word of segmenter.segment(part)) {
            if (word.isWordLike) words.push(word.segment);
            else if (/^[+#]+$/u.test(word.segment) && words.length) words[words.length - 1] += word.segment;
        }
        if (/[+#./\\]/u.test(part) && ! words.includes(part)) words.push(part);
        return words.length ? words : [part];
    });
}

export function readSearchState(parameters: URLSearchParams): SearchState {
    const date = (key: string) => {
        const value = parameters.get(key) ?? "";
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : "";
    };
    const sort = parameters.get("sort") as SearchSort;
    return {
        query: parameters.get("q")?.trim() ?? "",
        section: parameters.get("section") ?? "",
        source: parameters.get("source") ?? "",
        category: parameters.get("category") ?? "",
        tags: [...new Set(parameters.getAll("tag"))].filter(Boolean),
        from: date("from"),
        to: date("to"),
        sort: searchSorts.includes(sort) ? sort : "relevance",
    };
}

export function searchParameters(state: SearchState): URLSearchParams {
    const parameters = new URLSearchParams();
    if (state.query) parameters.set("q", state.query);
    if (state.section) parameters.set("section", state.section);
    if (state.source) parameters.set("source", state.source);
    if (state.category) parameters.set("category", state.category);
    for (const tag of state.tags) parameters.append("tag", tag);
    if (state.from) parameters.set("from", state.from);
    if (state.to) parameters.set("to", state.to);
    if (state.sort !== "relevance") parameters.set("sort", state.sort);
    return parameters;
}

export function searchSourceKey(source: string) {
    return source ? `external:${source}` : "local";
}

export function searchSourceValues(data: Pick<SearchDocument["data"], "sources">): readonly string[] {
    return data.sources.length ? data.sources : [""];
}

export function searchFilterOptions(documents: readonly SearchDocument[]) {
    const published = selectContent(documents);
    const sections = [...new Set(published.flatMap(({ data }) => data.placements))].sort();
    const sources = [...new Set(published.flatMap(({ data }) => searchSourceValues(data)))].sort()
        .map((title) => ({ value: searchSourceKey(title), title }));
    return { sections, sources };
}

export function discoveryIndex(documents: readonly SearchDocument[], locale: Locale) {
    const unique = new Map<string, SearchDocument>();
    for (const document of selectContent(documents)) {
        if (! unique.has(document.id) || document.data.locale === locale) unique.set(document.id, document);
    }
    const items = [...unique.values()].map((item) => ({ data: { ...item.data, locale } }));
    return {
        categories: getTaxonomyIndex(items, { kind: "category", locale }),
        tags: getTaxonomyIndex(items, { kind: "tag", locale }),
    };
}

export function createSearchIndex(documents: readonly SearchDocument[]) {
    const published = selectContent(documents);
    const fields = Object.keys(searchPolicy.weights) as (keyof typeof searchPolicy.weights)[];
    const rows = published.map((document) => ({
        document,
        fields: Object.fromEntries(fields.map((field) => {
            const text = field === "taxonomy" ? [document.data.category, ...document.data.tags].join(" ") : document.data[field];
            const terms = searchTerms(text);
            const counts = new Map<string, number>();
            for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
            return [field, { text: normalizeSearchText(text), length: terms.length, counts }];
        })) as Record<(typeof fields)[number], { text: string; length: number; counts: Map<string, number> }>,
    }));
    const stats = Object.fromEntries(fields.map((field) => {
        const populated = rows.filter((row) => row.fields[field].length > 0);
        return [field, {
            count: populated.length,
            average: populated.reduce((sum, row) => sum + row.fields[field].length, 0) / (populated.length || 1),
        }];
    })) as Record<(typeof fields)[number], { count: number; average: number }>;

    return (state: SearchState, locale: Locale) => {
        const terms = [...new Set(searchTerms(state.query))];
        const queryFields = fields.map((field) => {
            const frequencies = rows.map((row) => terms.map((term) => {
                const { text, counts } = row.fields[field];
                const exact = counts.get(term) ?? 0;
                const occurrences = text.split(term).length - 1;
                // Discount substring occurrences without counting exact matches twice.
                return exact + Math.max(0, occurrences - exact) * searchPolicy.partialMatchWeight;
            }));
            const documentFrequencies = terms.map((_, index) => frequencies.filter((row) => row[index] > 0).length);
            return { field, frequencies, documentFrequencies, ...stats[field] };
        });
        const accepted = new Set(selectContent(published, { ...state, placement: state.section }));
        const matches = rows.flatMap((row, rowIndex) => {
            const { document } = row;
            const day = document.data.date.slice(0, 10);
            if (! accepted.has(document) || (state.from && day < state.from) || (state.to && day > state.to)) return [];
            if (state.source && ! searchSourceValues(document.data).some((source) => searchSourceKey(source) === state.source)) return [];
            let score = 0;
            for (const { field, frequencies, documentFrequencies, count, average } of queryFields) {
                const { length } = row.fields[field];
                for (let index = 0; index < terms.length; index++) {
                    const tf = frequencies[rowIndex][index];
                    if (! tf) continue;
                    const df = documentFrequencies[index];
                    const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
                    score += searchPolicy.weights[field] * idf * tf * (searchPolicy.k1 + 1)
                        / (tf + searchPolicy.k1 * (1 - searchPolicy.b + searchPolicy.b * length / average));
                }
            }
            return terms.length && ! score ? [] : [{ document, score }];
        });
        matches.sort((a, b) => b.score - a.score
            || Number(b.document.data.locale === locale) - Number(a.document.data.locale === locale)
            || a.document.id.localeCompare(b.document.id));
        const unique = new Map<string, (typeof matches)[number]>();
        for (const match of matches) if (! unique.has(match.document.id)) unique.set(match.document.id, match);
        return [...unique.values()].sort((a, b) => {
            const date = (item: SearchDocument) => Date.parse(state.sort === "updated" ? item.data.updated ?? item.data.date : item.data.date);
            const relevance = state.sort === "relevance" && terms.length ? b.score - a.score : 0;
            return relevance || (state.sort === "oldest" ? date(a.document) - date(b.document) : date(b.document) - date(a.document))
                || a.document.id.localeCompare(b.document.id);
        });
    };
}

export function searchSnippet(document: SearchDocument, query: string) {
    const terms = searchTerms(query);
    const text = [document.data.description, document.data.body].find((text) => terms.some((term) => normalizeSearchText(text).includes(term)))
        || document.data.description || document.data.body;
    const positions = terms.map((term) => normalizeSearchText(text).indexOf(term)).filter((position) => position >= 0);
    const start = positions.length ? Math.max(0, Math.min(...positions) - 60) : 0;
    return `${start ? "…" : ""}${text.slice(start, start + searchPolicy.snippetLength)}${text.length > start + searchPolicy.snippetLength ? "…" : ""}`;
}
