import { compareMymusic5Sheets } from "../../config/mymusic5.ts";
import { getMymusic5Data } from "./store.mjs";
import type { Mymusic5Snapshot } from "./schema.ts";

export function getMymusic5Content(snapshot: Mymusic5Snapshot | null = getMymusic5Data()) {
    return {
        period: null,
        notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
        author: snapshot?.author ?? null,
        sheets: (snapshot?.sheets ?? []).toSorted(compareMymusic5Sheets),
    };
}
