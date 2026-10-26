import { compareYoutubeVideos } from "../../config/youtube.ts";
import { getYoutubeData } from "./store.mjs";
import type { YoutubeSnapshot } from "./schema.ts";

export function getYoutubeContent(snapshot: YoutubeSnapshot | null = getYoutubeData()) {
    const videos = snapshot?.videos ?? [];
    const uploads = new Set(snapshot?.uploadedVideoIds ?? []);
    return {
        period: null,
        notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
        channel: snapshot?.channel ?? null,
        videos: videos.filter((video) => uploads.has(video.id)).sort(compareYoutubeVideos),
        library: videos,
        playlists: snapshot?.playlists ?? [],
    };
}
