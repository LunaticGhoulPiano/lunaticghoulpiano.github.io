import type { Locale } from "../../config/site";
import { getContent } from "../../data/contents";
import { tagPath, categoryPath } from "../../routing";

export async function getBlogOverview(locale: Locale) {
    const items = await getContent();
    const localized = items.filter((item) => item.data.locale === locale);
    const allPosts = items.filter((item) => item.data.placements.includes("blog"));
    const count = (values: string[]) => {
        const counts = new Map<string, number>();
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        return [...counts].sort(([a], [b]) => a.localeCompare(b));
    };
    return {
        section: "blog" as const,
        allPosts,
        posts: allPosts.filter((item) => item.data.locale === locale),
        tags: count(localized.flatMap((item) => item.data.tags)).map(([tag, count]) => ({ tag, count })),
        categories: count(localized.map((item) => item.data.category)).map(([category, count]) => ({ category, count })),
    };
}

export async function getTaxonomyContext(taxonomy: "tag" | "category", value: string, locale: Locale) {
    const items = (await getContent()).filter((item) => taxonomy === "tag"
        ? item.data.tags.includes(value) : item.data.category === value);
    const path = taxonomy === "tag" ? tagPath : categoryPath;
    return {
        items: items.filter((item) => item.data.locale === locale),
        languagePaths: Object.fromEntries(items.map((item) => [item.data.locale, path(value, item.data.locale)])),
    };
}
