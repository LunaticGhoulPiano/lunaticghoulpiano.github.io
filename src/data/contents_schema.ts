import { z } from "astro/zod";
import { contentRules } from "../config/content.ts";
import { locales } from "../config/locales.ts";
import { dateSchema } from "../utils/dates.ts";
import { selectContent } from "./taxonomy.ts";

const identifier = z.string().regex(contentRules.slugPattern);
const tag = z.string().min(1).refine((value) => ! contentRules.invalidTagCharacters.test(value),
    "Tags must be valid Unicode text without whitespace or control characters.");
export const contentUrlSchema = z.string().min(1).refine((value) => {
    if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
    if (value.startsWith("/")) return ! value.startsWith("//");
    try {
        const url = new URL(value);
        return /^https?:\/\//.test(value) && ! url.username && ! url.password;
    }
    catch {
        return false;
    }
}, "Use a root-relative path or an HTTP(S) URL without credentials.");

const localFile = z.string().regex(/^\.\/(?!\/).+/).refine((value) =>
    ! value.split("/").some((part) => part === ".." || part === "")
    && ! /[\\\u0000-\u001f]/.test(value),
    "Use a ./ path within the item directory.");
const routePath = z.string().regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/);
const links = z.array(z.strictObject({
    label: z.string().trim().min(1),
    url: contentUrlSchema,
})).default([]);
export const entrySchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("markdown"), file: localFile.refine((value) => value.endsWith(".md")), path: routePath }),
    z.strictObject({ type: z.literal("astro"), file: localFile.refine((value) => value.endsWith(".astro")), path: routePath }),
    z.strictObject({ type: z.literal("link"), url: contentUrlSchema }),
    z.strictObject({
        type: z.literal("site"),
        root: localFile,
        path: routePath,
    }),
]);
const metadataFields = {
    kind: z.string(),
    category: identifier,
    tags: z.array(tag),
    placements: z.array(z.enum(contentRules.placements)),
    related: z.array(identifier),
    links,
};
const localizedFields = {
    title: z.string(),
    description: z.string(),
    date: dateSchema,
    updated: dateSchema.optional(),
    draft: z.boolean(),
    entry: entrySchema,
};
const localizedSchema = z.strictObject({
    ...localizedFields,
    title: localizedFields.title.trim().min(1),
    description: localizedFields.description.trim().min(1),
    draft: localizedFields.draft.default(true),
}).refine((data) => ! data.updated || data.updated >= data.date, "updated cannot precede date.");

export const itemConfigSchema = z.strictObject({
    schemaVersion: z.literal(1).default(1),
    id: identifier,
    ...metadataFields,
    kind: metadataFields.kind.trim().min(1),
    tags: metadataFields.tags.default([]),
    placements: metadataFields.placements.default([]),
    related: metadataFields.related.default([]),
    build: z.strictObject({
        command: z.array(z.string().min(1)).min(1),
        inputs: z.array(localFile).min(1),
        sharedInputs: z.array(localFile).default([]),
    }).optional(),
    locales: z.record(z.string(), localizedSchema),
}).superRefine((data, context) => {
    const keys = Object.keys(data.locales);
    if (! keys.length) context.addIssue({ code: "custom", path: ["locales"], message: "At least one locale is required." });
    for (const locale of keys) {
        if (! (locales as readonly string[]).includes(locale)) context.addIssue({ code: "custom", path: ["locales", locale], message: "Unknown site locale." });
    }
});

export const contentSchema = z.object({
    itemId: identifier,
    locale: z.enum(locales),
    ...metadataFields,
    ...localizedFields,
    href: z.string(),
    directory: z.string(),
    source: z.string().optional(),
});
export type ItemConfig = z.infer<typeof itemConfigSchema>;
export type ContentData = z.infer<typeof contentSchema>;
export type ContentRecord = { id: string; data: ContentData };
export type Placement = typeof contentRules.placements[number];

export function published<T extends ContentRecord>(entries: T[]): T[] {
    return selectContent(entries)
        .sort((a, b) => b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id));
}
