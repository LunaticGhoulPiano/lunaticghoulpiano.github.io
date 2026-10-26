import type { APIContext } from "astro";
import { getSearchDocuments } from "../services/search";
import { searchText } from "../utils/search_text.mjs";

export async function GET({ request }: APIContext) {
    const documents = await getSearchDocuments(true);
    if (import.meta.env.DEV) {
        for (const document of documents) {
            if (document.data.entryType !== "astro") continue;
            const response = await fetch(new URL(document.data.href, request.url));
            if (! response.ok) throw new Error(`Unable to index ${document.data.href}: ${response.status}`);
            document.data.body = searchText(await response.text());
        }
    }
    return Response.json(documents.map(({ id, data }) => ({
        id,
        data: {
            title: data.title, description: data.description, body: data.body, href: data.href,
            locale: data.locale, sources: data.sources, category: data.category, tags: data.tags,
            placements: data.placements, date: data.date, updated: data.updated,
            dateKind: data.dateKind, entryType: data.entryType,
        },
    })));
}
