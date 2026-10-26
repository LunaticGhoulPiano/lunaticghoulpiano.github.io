import { getCollection, type CollectionEntry } from "astro:content";
import { published } from "./contents_schema";
import { contentRules } from "../config/content";
import { selectContent } from "./taxonomy.ts";
import hasPublishedContent from "virtual:content-status";

export type ContentEntry = CollectionEntry<"items">;

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
