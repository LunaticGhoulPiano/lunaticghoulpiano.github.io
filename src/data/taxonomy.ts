import type { Locale } from "../config/locales.ts";
import { taxonomies, type Taxonomy } from "../config/content.ts";

const tags: Record<string, Record<Locale, string>> = {};

export interface ClassifiedItem {
    data: {
        locale: string;
        placements: readonly string[];
        tags: readonly string[];
        category: string;
        draft?: boolean;
    };
}

interface ContentSelection {
    locale?: string;
    placement?: string;
    taxonomy?: { kind: Taxonomy; value: string };
}

export function selectContent<T extends ClassifiedItem>(items: readonly T[], selection: ContentSelection = {}) {
    return items.filter(({ data }) =>
        ! data.draft
        && (! selection.locale || data.locale === selection.locale)
        && (! selection.placement || data.placements.includes(selection.placement))
        && (! selection.taxonomy || taxonomyValues(data, selection.taxonomy.kind).includes(selection.taxonomy.value)));
}

export function tagName(id: string, locale: Locale) {
    return tags[id]?.[locale] ?? id;
}

export function taxonomyName(taxonomy: Taxonomy, value: string, locale: Locale) {
    return taxonomy === "tag" ? tagName(value, locale) : value;
}

export function taxonomyValues(data: { tags: readonly string[]; category: string }, taxonomy: Taxonomy): readonly string[] {
    const value = data[taxonomies[taxonomy].field];
    return typeof value === "string" ? [value] : value;
}

interface TaxonomyQuery {
    kind: Taxonomy;
    locale?: Locale;
    placement?: string;
}

export function getTaxonomyIndex<T extends ClassifiedItem>(items: readonly T[], { kind, locale, placement }: TaxonomyQuery & { locale: Locale }) {
    const counts = new Map<string, number>();
    for (const item of selectContent(items, { locale, placement })) {
        for (const value of new Set(taxonomyValues(item.data, kind))) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({
        value,
        title: taxonomyName(kind, value, locale),
        count,
    }));
}

export function getTaxonomyItems<T extends ClassifiedItem>(items: readonly T[], { kind, value, locale, placement }: TaxonomyQuery & { value: string }) {
    return selectContent(items, { locale, placement, taxonomy: { kind, value } });
}
