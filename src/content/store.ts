import { getCollection, type CollectionEntry } from "astro:content";
import { published, validateContent } from "./schema";

export type Post = CollectionEntry<"blog">;

async function loadContent() {
    const [blog, projects, studying] = await Promise.all([
        getCollection("blog"),
        getCollection("projects"),
        getCollection("studying"),
    ]);
    validateContent(blog, projects, studying);
    return {
        blog: published(blog),
        projects: published(projects),
        studying: published(studying),
    };
}

let buildContent: ReturnType<typeof loadContent> | undefined;

export function getContent() {
    if (import.meta.env.DEV) return loadContent();
    return buildContent ??= loadContent();
}
