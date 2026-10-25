import { getCollection, type CollectionEntry } from "astro:content";
import { published, type Placement } from "./contents_schema";
import type { Locale } from "../config/locales";
import hasPublishedContent from "virtual:content-status";

export type ContentEntry = CollectionEntry<"items">;

export async function getContent(): Promise<ContentEntry[]> {
    return hasPublishedContent ? published(await getCollection("items")) : [];
}

export async function getPlacedContent(placement: Placement, locale?: Locale) {
    return (await getContent()).filter((item) =>
        item.data.placements.includes(placement) && (! locale || item.data.locale === locale));
}

export async function getContentContext(item: ContentEntry) {
    const items = await getContent();
    return {
        related: item.data.related.flatMap((id) => items.filter((other) =>
            other.data.itemId === id && other.data.locale === item.data.locale)),
        languagePaths: Object.fromEntries(items.filter((other) => other.data.itemId === item.data.itemId)
            .map((other) => [other.data.locale, other.data.href])),
    };
}
