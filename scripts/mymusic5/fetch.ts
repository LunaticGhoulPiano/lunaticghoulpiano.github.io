import { MyMusic5Client } from "mymusic5-api";
import { mymusic5Artist, mymusic5Policy } from "../../src/config/mymusic5.ts";
import { mymusic5AuthorSchema, mymusic5SheetSchema, mymusic5SnapshotSchema, type Mymusic5Snapshot } from "../../src/data/mymusic5/schema.ts";
import { mymusic5ToolPolicy } from "./config.ts";

function decodeText(value: string) {
    const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
        if (! entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
        const code = entity.slice(1, 2).toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
            ? String.fromCodePoint(code) : match;
    }).trim();
}

function snapshotTimestamp(value: unknown) {
    // Public detail timestamps omit the UTC suffix present in GraphQL timestamps.
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
        ? `${value}Z` : value;
}

export async function fetchMymusic5Snapshot(now = new Date(), request: typeof fetch = fetch) {
    let requests = 0;
    const client = new MyMusic5Client({
        pageSize: mymusic5ToolPolicy.pageSize,
        maxPages: mymusic5ToolPolicy.maxPages,
        timeoutMs: mymusic5ToolPolicy.requestTimeoutMs,
        fetch: (url, options) => {
            requests++;
            return request(url, options);
        },
    });
    const { data } = await client.artists.collectSheets(mymusic5Artist.artistUrl, {
        signal: AbortSignal.timeout(mymusic5ToolPolicy.refreshTimeoutMs),
    });
    let author: Mymusic5Snapshot["author"] = null;
    const sheets = data.map((entry) => {
        const owner = mymusic5AuthorSchema.parse(entry.author);
        const sheet = mymusic5SheetSchema.parse({
            ...entry,
            createdAt: snapshotTimestamp(entry.createdAt),
            updatedAt: snapshotTimestamp(entry.updatedAt),
        });
        author ??= { ...owner, name: decodeText(owner.name) };
        return {
            ...sheet,
            title: decodeText(sheet.title),
            metaSong: decodeText(sheet.metaSong),
            metaMusician: decodeText(sheet.metaMusician),
            metaMaker: decodeText(sheet.metaMaker),
            description: decodeText(sheet.description.replace(/<[^>]*>/g, " ")),
        };
    });
    sheets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.sheetId - a.sheetId);
    const snapshot = mymusic5SnapshotSchema.parse({
        schemaVersion: mymusic5Policy.schemaVersion,
        source: "mymusic5",
        artistUrl: mymusic5Artist.artistUrl,
        lastSuccessfulFetchAt: now.toISOString(),
        author,
        sheets,
    });
    return { snapshot, requests };
}
