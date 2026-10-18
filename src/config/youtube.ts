import { socialLinks } from "./social.ts";

const channelUrl = socialLinks.find((link) => link.platform === "youtube")!.url;

export const youtubeChannel = {
    url: channelUrl,
    handle: new URL(channelUrl).pathname.slice(1),
} as const;

export const youtubePolicy = {
    snapshotFilename: "youtube_snapshot.json",
    schemaVersion: 3,
} as const;
