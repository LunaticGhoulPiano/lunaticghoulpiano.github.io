import { getSourceSearchDocuments } from "./sources.ts";
import { getContent, type ContentEntry } from "../data/contents";
import type { SearchDocument } from "../data/search.ts";
import { projectRoot } from "../config/runtime.mjs";
import { readSiteSearchText } from "../../scripts/content/search.mjs";
import { searchText } from "../utils/search_text.mjs";

export function buildSearchDocuments(
    content: readonly ContentEntry[],
    sourceDocuments: readonly SearchDocument[] = getSourceSearchDocuments(),
): SearchDocument[] {
    const documents: SearchDocument[] = content.filter((item) => ! item.data.draft).map((item) => ({
        id: `content:${item.data.itemId}`,
        data: {
            ...item.data,
            body: searchText(item.rendered?.html ?? item.body ?? ""),
            sources: [],
            dateKind: "published",
            entryType: item.data.entry.type,
        },
    }));
    documents.push(...sourceDocuments);
    return documents;
}

export async function getSearchDocuments(includeSiteText = false): Promise<SearchDocument[]> {
    const content = await getContent();
    const documents = buildSearchDocuments(content);
    if (includeSiteText) {
        for (const item of content) {
            if (item.data.entry.type !== "site") continue;
            const document = documents.find((document) => document.id === `content:${item.data.itemId}` && document.data.locale === item.data.locale)!;
            document.data.body = await readSiteSearchText(projectRoot, item.data.directory, item.data.entry.root);
        }
    }
    return documents;
}
