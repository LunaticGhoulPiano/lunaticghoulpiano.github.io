import type { Locale } from "../../config/site";
import { getContent, type Post } from "../../content/store";
import { postPath, tagPath } from "../../routing";

export async function getPublicPosts(locale?: Locale): Promise<Post[]> {
    const { blog: posts } = await getContent();
    return locale ? posts.filter((entry) => entry.data.locale === locale) : posts;
}

export async function getPostContext(post: Post) {
    const posts = await getPublicPosts();
    const byId = new Map(posts.map((entry) => [entry.id, entry]));
    return {
        related: post.data.relatedPosts.flatMap((id) => {
            const related = byId.get(id);
            return related ? [related] : [];
        }),
        languagePaths: Object.fromEntries(posts
            .filter((entry) => entry.data.translationKey === post.data.translationKey)
            .map((entry) => [entry.data.locale, postPath(entry)])),
    };
}

export async function getBlogOverview(locale: Locale) {
    const allPosts = await getPublicPosts();
    const posts = allPosts.filter((post) => post.data.locale === locale);
    const counts = new Map<string, number>();
    for (const post of posts) {
        for (const tag of new Set(post.data.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return {
        section: "blog" as const,
        allPosts,
        posts,
        tags: [...counts.keys()].sort().map((tag) => ({
            tag,
            count: counts.get(tag)!,
        })),
    };
}

export async function getTagContext(tag: string, locale: Locale) {
    const posts = (await getPublicPosts()).filter((post) => post.data.tags.includes(tag));
    return {
        posts: posts.filter((post) => post.data.locale === locale),
        languagePaths: Object.fromEntries(posts.map((post) => [post.data.locale, tagPath(tag, post.data.locale)])),
    };
}
