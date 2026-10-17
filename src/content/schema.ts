import { contentRules } from "../config/content.ts";
import { routes } from "../config/routes.ts";
import { z } from "astro/zod";
import { dateSchema } from "../utils/dates.ts";
import { locales } from "../config/locales.ts";

const pathSlugSchema = z.string().regex(contentRules.slugPattern);
const localeSchema = z.enum(locales);
export const contentIdSchema = z.string().refine((value) => {
    const parts = value.split("/");
    return (
        parts.length === 2
        && localeSchema.safeParse(parts[0]).success
        && pathSlugSchema.safeParse(parts[1]).success
    );
}, "Use a configured locale followed by /pathSlug.");

const fields = {
    title: z.string().trim().min(1),
    slug: contentIdSchema,
    pathSlug: pathSlugSchema,
    locale: localeSchema,
    translationKey: pathSlugSchema,
    description: z.string().trim().min(1),
    date: dateSchema,
    updated: dateSchema.optional(),
    draft: z.boolean().default(true),
    tags: z.array(pathSlugSchema).default([]),
    relatedPosts: z.array(contentIdSchema).default([]),
    relatedProjects: z.array(contentIdSchema).default([]),
};

const commonSchema = z.object(fields)
    .refine((data) => data.slug === `${data.locale}/${data.pathSlug}`, "slug must equal locale/pathSlug.")
    .refine((data) => ! data.updated || data.updated >= data.date, "updated cannot precede date.");

export const blogSchema = commonSchema.safeExtend({
    type: z.enum(contentRules.articleTypes),
}).refine((data) => ! Object.values(routes).some((route) => route.path === `${routes.blog.path}/${data.pathSlug}`), "Article path conflicts with a reserved route.");

export const projectSchema = commonSchema.safeExtend({
    status: z.enum(contentRules.projectStatuses),
});

export const studyingSchema = commonSchema.safeExtend({
    status: z.enum(contentRules.studyingStatuses),
});

type ContentEntry = {
    id: string;
    data: z.infer<typeof commonSchema>;
};

export function validateContent(entries: ContentEntry[], projects: ContentEntry[] = [], studying: ContentEntry[] = []) {
    for (const collection of [entries, projects, studying]) {
        const ids = new Set<string>();
        const translations = new Set<string>();
        for (const entry of collection) {
            if (entry.id !== entry.data.slug || ids.has(entry.id)) throw new Error(`Invalid or duplicate content ID: ${entry.id}`);
            const pair = `${entry.data.locale}/${entry.data.translationKey}`;
            if (translations.has(pair)) throw new Error(`Duplicate translation: ${pair}`);
            ids.add(entry.id);
            translations.add(pair);
        }
    }
    const postsById = new Map(entries.map((entry) => [entry.id, entry]));
    const projectsById = new Map(projects.map((entry) => [entry.id, entry]));
    for (const entry of [...entries, ...projects, ...studying]) {
        for (const [references, targets] of [
            [entry.data.relatedPosts, postsById],
            [entry.data.relatedProjects, projectsById],
        ] as const) {
            for (const id of references) {
                const target = targets.get(id);
                if (! target || (! entry.data.draft && target.data.draft)) throw new Error(`Invalid content reference in ${entry.id}: ${id}`);
            }
        }
    }
}

export function published<T extends ContentEntry>(entries: T[]): T[] {
    return entries
        .filter((entry) => ! entry.data.draft)
        .sort((a, b) => b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id));
}
