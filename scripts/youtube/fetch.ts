import { z } from "astro/zod";
import { youtubeChannel, youtubePolicy, compareYoutubeVideos } from "../../src/config/youtube.ts";
import { channelId, videoId, playlistId, youtubeCount, youtubeDuration, youtubeImage, youtubeTimestamp, youtubeSnapshotSchema, type YoutubeSnapshot } from "../../src/data/youtube/schema.ts";
import { youtubeToolPolicy } from "./config.ts";

const thumbnails = z.record(z.string(), z.object({ url: youtubeImage }));
const privacyStatus = z.object({ privacyStatus: z.enum(["public", "private", "unlisted"]) });
const mediaSnippet = z.object({
    channelId,
    title: z.string().min(1),
    description: z.string().default(""),
    publishedAt: youtubeTimestamp,
    thumbnails,
});
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
    status: privacyStatus,
    snippet: mediaSnippet,
    contentDetails: z.object({ duration: youtubeDuration }),
    statistics: z.object({
        viewCount: youtubeCount.optional(),
        likeCount: youtubeCount.optional(),
    }),
});
const uploadResponse = z.object({ contentDetails: z.object({ videoId }) });
const playlistResponse = z.object({
    id: playlistId,
    snippet: mediaSnippet,
    status: privacyStatus,
});
const playlistItemResponse = z.object({
    id: z.string().min(1),
    snippet: z.object({
        playlistId,
        position: z.number().int().nonnegative(),
        resourceId: z.object({ kind: z.literal("youtube#video"), videoId }),
    }),
    status: privacyStatus,
});

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

    async function pages<T>(resource: string, parameters: Record<string, string>, schema: z.ZodType<T>) {
        const items: T[] = [];
        const tokens = new Set<string>();
        let pageToken: string | undefined;
        do {
            const page = await list(resource, {
                ...parameters,
                maxResults: String(youtubeToolPolicy.pageSize),
                ...(pageToken ? { pageToken } : {}),
            }, schema);
            items.push(...page.items);
            pageToken = page.nextPageToken;
            if (pageToken && tokens.has(pageToken)) throw new Error("YouTube returned a repeated page token; previous snapshot retained.");
            if (pageToken) tokens.add(pageToken);
        } while (pageToken);
        return items;
    }

    const channels = await list("channels", {
        part: "snippet,contentDetails,statistics",
        forHandle: youtubeChannel.handle,
    }, channelResponse);
    if (channels.items.length !== 1) throw new Error("The configured YouTube channel was not found.");
    const channel = channels.items[0];
    const uploads = await pages("playlistItems", {
        part: "contentDetails",
        playlistId: channel.contentDetails.relatedPlaylists.uploads,
    }, uploadResponse);
    const uploadedIds = new Set(uploads.map((item) => item.contentDetails.videoId));
    const ids = new Set(uploadedIds);
    const playlists: YoutubeSnapshot["playlists"] = [];
    for (const playlist of await pages("playlists", {
        part: "snippet,status",
        channelId: channel.id,
    }, playlistResponse)) {
        if (playlist.snippet.channelId !== channel.id) throw new Error("YouTube returned an unexpected playlist owner.");
        if (playlist.status.privacyStatus !== "public") continue;
        if (playlists.some((entry) => entry.id === playlist.id)) throw new Error("YouTube returned a duplicate playlist.");
        const items = await pages("playlistItems", {
            part: "snippet,status",
            playlistId: playlist.id,
        }, playlistItemResponse);
        for (const item of items) {
            if (item.snippet.playlistId !== playlist.id) throw new Error("YouTube returned an unexpected playlist item.");
        }
        const publicItems = items.filter((item) => item.status.privacyStatus === "public").map((item) => ({
            id: item.id,
            videoId: item.snippet.resourceId.videoId,
            position: item.snippet.position,
        })).sort((a, b) => a.position - b.position);
        for (const item of publicItems) ids.add(item.videoId);
        playlists.push({
            id: playlist.id,
            channelId: playlist.snippet.channelId,
            title: playlist.snippet.title,
            description: playlist.snippet.description,
            thumbnail: thumbnail(playlist.snippet.thumbnails),
            createdAt: playlist.snippet.publishedAt,
            items: publicItems,
        });
    }

    const videos: YoutubeSnapshot["videos"] = [];
    const videoIds = [...ids];
    for (let start = 0; start < videoIds.length; start += youtubeToolPolicy.pageSize) {
        const batch = videoIds.slice(start, start + youtubeToolPolicy.pageSize);
        const page = await list("videos", { part: "snippet,status,contentDetails,statistics", id: batch.join(",") }, videoResponse);
        for (const video of page.items) {
            if (! batch.includes(video.id) || (uploadedIds.has(video.id) && video.snippet.channelId !== channel.id)) {
                throw new Error("YouTube returned an unexpected video.");
            }
            if (video.status.privacyStatus !== "public") continue;
            videos.push({
                id: video.id,
                channelId: video.snippet.channelId,
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
    videos.sort(compareYoutubeVideos);
    const available = new Set(videos.map((video) => video.id));
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
        uploadedVideoIds: [...uploadedIds].filter((id) => available.has(id)),
        playlists: playlists.map((playlist) => ({
            ...playlist,
            items: playlist.items.filter((item) => available.has(item.videoId)),
        })),
    });
    return { snapshot, requests };
}
