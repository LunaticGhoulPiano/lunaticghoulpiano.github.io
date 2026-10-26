import { socialLinks } from "./social.ts";

const channelUrl = socialLinks.find((link) => link.platform === "youtube")!.url;

export const youtubeChannel = {
    url: channelUrl,
    handle: new URL(channelUrl).pathname.slice(1),
} as const;

export function youtubeVideoUrl(id: string) {
    return `https://www.youtube.com/watch?v=${id}`;
}

export function compareYoutubeVideos(a: { publishedAt: string; id: string }, b: typeof a) {
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
}

export const youtubePolicy = {
    snapshotFilename: "youtube_snapshot.json",
    schemaVersion: 3,
} as const;
