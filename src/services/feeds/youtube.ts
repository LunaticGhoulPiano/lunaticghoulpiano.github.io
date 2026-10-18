import { getYoutubeData } from "../../data/youtube/store.mjs";
import type { YoutubeSnapshot } from "../../data/youtube/schema.ts";

export function getYoutubeFeed(snapshot: YoutubeSnapshot | null = getYoutubeData()) {
    return {
        period: null,
        notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
        channel: snapshot?.channel ?? null,
        videos: [...(snapshot?.videos ?? [])].sort((a, b) =>
            Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)),
    };
}
