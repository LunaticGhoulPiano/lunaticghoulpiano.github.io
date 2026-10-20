import { socialLinks } from "./social.ts";

const profileUrl = new URL(socialLinks.find((link) => link.platform === "mymusic5")!.url);

export const mymusic5Artist = {
    origin: profileUrl.origin,
    artistUrl: profileUrl.pathname.split("/").filter(Boolean)[0],
} as const;

export const mymusic5Policy = {
    snapshotFilename: "mymusic5_snapshot.json",
    schemaVersion: 1,
} as const;

export function mymusic5Url(artistUrl: string, sheetId?: number) {
    return `${mymusic5Artist.origin}/${encodeURIComponent(artistUrl)}${sheetId === undefined ? "" : `/${sheetId}`}`;
}
