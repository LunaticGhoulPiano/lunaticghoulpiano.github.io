import type { Locale } from "../config/locales.ts";
import { taxonomies, type Taxonomy } from "../config/content.ts";

const tags: Record<string, Record<Locale, string>> = {};

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
