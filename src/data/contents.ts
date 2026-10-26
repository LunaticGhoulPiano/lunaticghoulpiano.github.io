import { getCollection, type CollectionEntry } from "astro:content";
import { published, type Placement } from "./contents_schema";
import { contentRules, type Taxonomy } from "../config/content";
import type { Locale } from "../config/locales";
import { taxonomyValues } from "./tags";
import hasPublishedContent from "virtual:content-status";

export type ContentEntry = CollectionEntry<"items">;

interface Selection {
    locale?: Locale;
    placement?: Placement;
    taxonomy?: { kind: Taxonomy; value: string };
}

export function selectContent(items: readonly ContentEntry[], selection: Selection = {}) {
    return items.filter(({ data }) =>
        (! selection.locale || data.locale === selection.locale)
        && (! selection.placement || data.placements.includes(selection.placement))
        && (! selection.taxonomy || taxonomyValues(data, selection.taxonomy.kind).includes(selection.taxonomy.value)));
}

export async function getContent(): Promise<ContentEntry[]> {
    return hasPublishedContent ? published(await getCollection("items")) : [];
}

export function getContentContext(item: ContentEntry, items: readonly ContentEntry[]) {
    const localized = selectContent(items, { locale: item.data.locale });
    return {
        route: item.data.placements[0] ?? contentRules.defaultPlacement,
        related: item.data.related.flatMap((id) => localized.filter((other) => other.data.itemId === id)),
        languagePaths: Object.fromEntries(items.filter((other) => other.data.itemId === item.data.itemId)
            .map((other) => [other.data.locale, other.data.href])),
    };
}
