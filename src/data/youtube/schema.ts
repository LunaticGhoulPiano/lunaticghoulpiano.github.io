import { z } from "astro/zod";
import { youtubePolicy } from "../../config/youtube.ts";

import { timestampSchema } from "../../utils/dates.ts";

export const youtubeTimestamp = timestampSchema;
export const youtubeCount = z.string().regex(/^(0|[1-9]\d*)$/);
export const channelId = z.string().regex(/^UC[\w-]{22}$/);
export const videoId = z.string().regex(/^[\w-]{11}$/);
export const playlistId = z.string().regex(/^[\w-]+$/);
export const youtubePlaylistItemSchema = z.object({
    id: z.string().min(1),
    videoId,
    position: z.number().int().nonnegative(),
});
export const youtubeDuration = z.string()
    .regex(/^P(?=\d+D|T\d)(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
    .transform((value) => {
        const units = { D: 86400, H: 3600, M: 60, S: 1 };
        return [...value.matchAll(/(\d+)([DHMS])/g)].reduce((seconds, match) =>
            seconds + Number(match[1]) * units[match[2] as keyof typeof units], 0);
    })
    .pipe(z.number().int().nonnegative());
export const youtubeImage = z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && ! url.username && ! url.password
        && ["yt3.ggpht.com", "yt3.googleusercontent.com", "i.ytimg.com"].includes(url.hostname);
}, "Expected a YouTube image URL.");

export const youtubeVideoSchema = z.object({
    id: videoId,
    channelId,
    title: z.string().min(1),
    description: z.string().trim(),
    durationSeconds: z.number().int().nonnegative(),
    views: youtubeCount.nullable(),
    likes: youtubeCount.nullable(),
    publishedAt: youtubeTimestamp,
    thumbnail: youtubeImage.nullable(),
});

export const youtubeSnapshotSchema = z.object({
    schemaVersion: z.literal(youtubePolicy.schemaVersion),
    source: z.literal("youtube"),
    handle: z.string().startsWith("@"),
    lastSuccessfulFetchAt: youtubeTimestamp,
    channel: z.object({
        id: channelId,
        title: z.string().min(1),
        avatar: youtubeImage.nullable(),
        createdAt: youtubeTimestamp,
        subscribers: youtubeCount.nullable(),
        publicVideos: youtubeCount,
        views: youtubeCount,
    }),
    videos: z.array(youtubeVideoSchema),
    uploadedVideoIds: z.array(videoId),
    playlists: z.array(z.object({
        id: playlistId,
        channelId,
        title: z.string().min(1),
        description: z.string().trim(),
        thumbnail: youtubeImage.nullable(),
        createdAt: youtubeTimestamp,
        items: z.array(youtubePlaylistItemSchema),
    })),
}).superRefine((snapshot, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    const videos = new Map(snapshot.videos.map((video) => [video.id, video]));
    if (videos.size !== snapshot.videos.length) invalid("Duplicate YouTube videos.");
    const referenced = new Set(snapshot.uploadedVideoIds);
    if (referenced.size !== snapshot.uploadedVideoIds.length) invalid("Duplicate uploaded video references.");
    for (const id of snapshot.uploadedVideoIds) {
        if (videos.get(id)?.channelId !== snapshot.channel.id) invalid("Invalid uploaded video ownership or reference.");
    }
    const playlists = new Set<string>();
    for (const playlist of snapshot.playlists) {
        if (playlists.has(playlist.id)) invalid("Duplicate YouTube playlists.");
        playlists.add(playlist.id);
        if (playlist.channelId !== snapshot.channel.id) invalid("Unexpected playlist owner.");
        const items = new Set<string>();
        let previousPosition = -1;
        for (const item of playlist.items) {
            if (items.has(item.id) || item.position <= previousPosition) invalid("Invalid playlist item order or identity.");
            items.add(item.id);
            previousPosition = item.position;
            if (! videos.has(item.videoId)) invalid("Unresolved playlist video reference.");
            referenced.add(item.videoId);
        }
    }
    if (snapshot.videos.some((video) => ! referenced.has(video.id))) invalid("Unreferenced YouTube video.");
});

export type YoutubeSnapshot = z.infer<typeof youtubeSnapshotSchema>;
