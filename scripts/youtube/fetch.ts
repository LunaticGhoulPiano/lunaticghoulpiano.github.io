import { z } from "astro/zod";
import { youtubeChannel, youtubePolicy } from "../../src/config/youtube.ts";
import { channelId, videoId, youtubeCount, youtubeDuration, youtubeImage, youtubeTimestamp, youtubeSnapshotSchema, type YoutubeSnapshot } from "../../src/data/youtube/schema.ts";
import { youtubeToolPolicy } from "./config.ts";

const thumbnails = z.record(z.string(), z.object({ url: youtubeImage }));
const channelResponse = z.object({
    id: channelId,
    snippet: z.object({
        title: z.string().min(1),
        publishedAt: youtubeTimestamp,
        thumbnails,
    }),
    contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().min(1) }) }),
    statistics: z.object({
        subscriberCount: youtubeCount.optional(),
        hiddenSubscriberCount: z.boolean(),
        videoCount: youtubeCount,
        viewCount: youtubeCount,
    }),
});
const videoResponse = z.object({
    id: videoId,
    status: z.object({ privacyStatus: z.enum(["public", "private", "unlisted"]) }),
    snippet: z.object({
        channelId,
        title: z.string().min(1),
        description: z.string().default(""),
        publishedAt: youtubeTimestamp,
        thumbnails,
    }),
    contentDetails: z.object({ duration: youtubeDuration }),
    statistics: z.object({
        viewCount: youtubeCount.optional(),
        likeCount: youtubeCount.optional(),
    }),
});
const uploadResponse = z.object({ contentDetails: z.object({ videoId }) });

function thumbnail(images: z.infer<typeof thumbnails>) {
    return images.medium?.url ?? images.high?.url ?? images.default?.url ?? Object.values(images)[0]?.url ?? null;
}

export async function fetchYoutubeSnapshot(key: string, now = new Date(), request = fetch) {
    if (! key) throw new Error(`Missing ${youtubeToolPolicy.credential}; no YouTube requests were made.`);
    const startedAt = Date.now();
    let requests = 0;

    async function list<T>(resource: string, parameters: Record<string, string>, schema: z.ZodType<T>) {
        if (++requests > youtubeToolPolicy.maxRequests || Date.now() - startedAt >= youtubeToolPolicy.refreshTimeoutMs) {
            throw new Error("YouTube refresh budget reached; previous snapshot retained.");
        }
        const url = new URL(resource, youtubeToolPolicy.apiUrl);
        url.search = new URLSearchParams({ ...parameters, key }).toString();
        let response: Response;
        try {
            response = await request(url, {
                redirect: "error",
                signal: AbortSignal.timeout(Math.min(youtubeToolPolicy.requestTimeoutMs,
                    Math.max(1, youtubeToolPolicy.refreshTimeoutMs - (Date.now() - startedAt)))),
            });
        }
        catch {
            throw new Error("YouTube connection failed; previous snapshot retained.");
        }
        if (! response.ok) {
            throw new Error(`YouTube ${resource} request failed (HTTP ${response.status}); previous snapshot retained.`);
        }
        try {
            return z.object({ items: z.array(schema), nextPageToken: z.string().min(1).optional() }).parse(await response.json());
        }
        catch {
            throw new Error(`Invalid YouTube ${resource} response; previous snapshot retained.`);
        }
    }

    const channels = await list("channels", {
        part: "snippet,contentDetails,statistics",
        forHandle: youtubeChannel.handle,
    }, channelResponse);
    if (channels.items.length !== 1) throw new Error("The configured YouTube channel was not found.");
    const channel = channels.items[0];
    const ids = new Set<string>();
    const pageTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
        const page = await list("playlistItems", {
            part: "contentDetails",
            playlistId: channel.contentDetails.relatedPlaylists.uploads,
            maxResults: String(youtubeToolPolicy.pageSize),
            ...(pageToken ? { pageToken } : {}),
        }, uploadResponse);
        for (const item of page.items) ids.add(item.contentDetails.videoId);
        pageToken = page.nextPageToken;
        if (pageToken && pageTokens.has(pageToken)) throw new Error("YouTube returned a repeated page token; previous snapshot retained.");
        if (pageToken) pageTokens.add(pageToken);
    } while (pageToken);

    const videos: YoutubeSnapshot["videos"] = [];
    const videoIds = [...ids];
    for (let start = 0; start < videoIds.length; start += youtubeToolPolicy.pageSize) {
        const batch = videoIds.slice(start, start + youtubeToolPolicy.pageSize);
        const page = await list("videos", { part: "snippet,status,contentDetails,statistics", id: batch.join(",") }, videoResponse);
        for (const video of page.items) {
            if (! batch.includes(video.id) || video.snippet.channelId !== channel.id) throw new Error("YouTube returned an unexpected video.");
            if (video.status.privacyStatus !== "public") continue;
            videos.push({
                id: video.id,
                title: video.snippet.title,
                description: video.snippet.description,
                durationSeconds: video.contentDetails.duration,
                views: video.statistics.viewCount ?? null,
                likes: video.statistics.likeCount ?? null,
                publishedAt: video.snippet.publishedAt,
                thumbnail: thumbnail(video.snippet.thumbnails),
            });
        }
    }
    videos.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
    const snapshot = youtubeSnapshotSchema.parse({
        schemaVersion: youtubePolicy.schemaVersion,
        source: "youtube",
        handle: youtubeChannel.handle,
        lastSuccessfulFetchAt: now.toISOString(),
        channel: {
            id: channel.id,
            title: channel.snippet.title,
            avatar: thumbnail(channel.snippet.thumbnails),
            createdAt: channel.snippet.publishedAt,
            subscribers: channel.statistics.hiddenSubscriberCount ? null : channel.statistics.subscriberCount ?? null,
            publicVideos: channel.statistics.videoCount,
            views: channel.statistics.viewCount,
        },
        videos,
    });
    return { snapshot, requests };
}
