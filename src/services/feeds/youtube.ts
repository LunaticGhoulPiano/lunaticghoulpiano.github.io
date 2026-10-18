import { getYoutubeData } from "../../data/youtube/store.mjs";
import type { YoutubeSnapshot } from "../../data/youtube/schema.ts";

export function getYoutubeFeed(snapshot: YoutubeSnapshot | null = getYoutubeData()) {
    const videos = snapshot?.videos ?? [];
    const uploads = new Set(snapshot?.uploadedVideoIds ?? []);
    return {
        period: null,
        notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
        channel: snapshot?.channel ?? null,
        videos: videos.filter((video) => uploads.has(video.id)).sort((a, b) =>
            Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)),
        library: videos,
        playlists: snapshot?.playlists ?? [],
    };
}
