import { z } from "astro/zod";
import { mymusic5Policy } from "../../config/mymusic5.ts";

const timestamp = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const image = z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && ! url.username && ! url.password
        && ["img.musicfive.com", "cdn.mymusic5.com", "cdn.mymusicsheet.com"].includes(url.hostname);
}, "Expected a MyMusic5 image URL.");

export const mymusic5AuthorSchema = z.object({
    name: z.string().trim().min(1),
    artistUrl: z.string().regex(/^[\w-]+$/),
    profileUrl: image.nullable(),
});

export const mymusic5SheetSchema = z.object({
    sheetId: z.number().int().positive(),
    title: z.string().trim().min(1),
    description: z.string(),
    metaSong: z.string(),
    metaMusician: z.string(),
    metaMaker: z.string(),
    thumbnailUrl: image.nullable(),
    youtubeId: z.string().regex(/^[\w-]{11}$/).nullable(),
    instruments: z.array(z.string().min(1)),
    level: z.number().int().nonnegative().nullable(),
    instrumentation: z.string().nullable(),
    sheetType: z.string().nullable(),
    includeChord: z.boolean(),
    includeLyrics: z.boolean(),
    price: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    isFree: z.boolean(),
    status: z.literal("ON_SALE"),
    createdAt: timestamp,
    updatedAt: timestamp,
    likes: z.number().int().nonnegative(),
}).refine((sheet) => Date.parse(sheet.updatedAt) >= Date.parse(sheet.createdAt), {
    message: "The sheet update date precedes its creation date.",
}).refine((sheet) => sheet.isFree === (sheet.price === 0), {
    message: "The free flag and price disagree.",
});

export const mymusic5SnapshotSchema = z.object({
    schemaVersion: z.literal(mymusic5Policy.schemaVersion),
    source: z.literal("mymusic5"),
    artistUrl: z.string().min(1),
    lastSuccessfulFetchAt: timestamp,
    author: mymusic5AuthorSchema.nullable(),
    sheets: z.array(mymusic5SheetSchema),
}).superRefine((snapshot, context) => {
    if (new Set(snapshot.sheets.map((sheet) => sheet.sheetId)).size !== snapshot.sheets.length) {
        context.addIssue({ code: "custom", message: "Duplicate MyMusic5 sheets." });
    }
    if ((snapshot.sheets.length > 0 && ! snapshot.author)
        || (snapshot.author && snapshot.author.artistUrl.toLowerCase() !== snapshot.artistUrl.toLowerCase())) {
        context.addIssue({ code: "custom", message: "Unexpected MyMusic5 author." });
    }
});

export type Mymusic5Snapshot = z.infer<typeof mymusic5SnapshotSchema>;
