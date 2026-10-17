import type { Locale } from "../config/site";

const tags: Record<string, Record<Locale, string>> = {};

export function tagName(id: string, locale: Locale) {
    return tags[id]?.[locale] ?? id;
}
