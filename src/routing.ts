import { routes, type RouteKey } from "./config/routes.ts";
import { localizedPath, locales, type Locale } from "./config/locales.ts";
import type { ContentRecord } from "./data/contents_schema.ts";
import type { SiteSection } from "./config/navigation.ts";
import { taxonomies, taxonomyKinds, type Taxonomy } from "./config/content.ts";
import { taxonomyValues } from "./data/tags.ts";

export function getRoutePath(route: RouteKey, locale: Locale): string {
    return localizedPath(routes[route].path, locale);
}

export function contentPath(item: ContentRecord) {
    return item.data.href;
}

export function tagPath(tag: string, locale: Locale) {
    return taxonomyPath("tag", tag, locale);
}

export function categoryPath(category: string, locale: Locale) {
    return taxonomyPath("category", category, locale);
}

export function taxonomyPath(taxonomy: Taxonomy, value: string, locale: Locale) {
    return `${getRoutePath(taxonomies[taxonomy].route, locale)}${value}/`;
}

function pageEntry<T>(path: string, props: T) {
    return { params: { path: path.slice(1, -1) || undefined }, props };
}

export function getPageEntries(items: readonly ContentRecord[]) {
    const published = items.filter((item) => ! item.data.draft);
    const pages = locales.flatMap((locale) => [
        pageEntry(localizedPath("", locale), { kind: "page" as const, route: "profile" as const, locale }),
        ...(Object.keys(routes) as RouteKey[]).map((route) =>
            pageEntry(getRoutePath(route, locale), { kind: "page" as const, route, locale })),
    ]);
    const entries = published.filter((item) => item.data.entry.type === "markdown")
        .map((item) => pageEntry(contentPath(item), { kind: "content" as const, id: item.id }));
    const taxonomyPages = new Map<string, { kind: "taxonomy"; taxonomy: Taxonomy; value: string; locale: Locale }>();
    for (const item of published) {
        const { locale } = item.data;
        for (const taxonomy of taxonomyKinds) {
            for (const value of taxonomyValues(item.data, taxonomy)) {
                taxonomyPages.set(taxonomyPath(taxonomy, value, locale), { kind: "taxonomy", taxonomy, value, locale });
            }
        }
    }
    return [...pages, ...entries, ...[...taxonomyPages].map(([path, props]) => pageEntry(path, props))];
}

export function getSectionRoutes(section: SiteSection) {
    return (Object.keys(routes) as RouteKey[]).filter((route) => routes[route].section === section);
}

export function isSectionActive(current: RouteKey | undefined, section: SiteSection): boolean {
    return current ? routes[current].section === section : false;
}
