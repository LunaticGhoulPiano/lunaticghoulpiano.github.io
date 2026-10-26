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

export const mymusic5Difficulties = {
    0: "beginner", 1: "easy", 2: "normal", 3: "hard", 4: "expert",
} as const;

export function mymusic5DifficultyLabels(copy: Record<typeof mymusic5Difficulties[keyof typeof mymusic5Difficulties], string>): Record<number, string> {
    return Object.fromEntries(Object.entries(mymusic5Difficulties).map(([level, key]) => [level, copy[key]]));
}

export function compareMymusic5Sheets(a: { createdAt: string; sheetId: number }, b: typeof a) {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.sheetId - a.sheetId;
}

export function mymusic5Url(artistUrl: string, sheetId?: number) {
    return `${mymusic5Artist.origin}/${encodeURIComponent(artistUrl)}${sheetId === undefined ? "" : `/${sheetId}`}`;
}
