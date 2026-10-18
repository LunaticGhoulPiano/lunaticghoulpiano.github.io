import { z } from "astro/zod";
import { youtubePolicy } from "../../config/youtube.ts";

export const youtubeTimestamp = z.iso.datetime({ offset: true })
    .transform((value) => new Date(value).toISOString());
export const youtubeCount = z.string().regex(/^(0|[1-9]\d*)$/);
export const channelId = z.string().regex(/^UC[\w-]{22}$/);
export const videoId = z.string().regex(/^[\w-]{11}$/);
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
}).refine((snapshot) => new Set(snapshot.videos.map((video) => video.id)).size === snapshot.videos.length,
    "Duplicate YouTube videos.");

export type YoutubeSnapshot = z.infer<typeof youtubeSnapshotSchema>;
