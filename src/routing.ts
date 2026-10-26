import { routes, getTaxonomyRoutes, type RouteKey } from "./config/routes.ts";
import { localizedPath, locales, type Locale } from "./config/locales.ts";
import type { ContentRecord } from "./data/contents_schema.ts";
import type { SiteSection } from "./config/navigation.ts";
import type { Taxonomy } from "./config/content.ts";
import { selectContent, getTaxonomyIndex } from "./data/taxonomy.ts";
import { tagSegment } from "./utils/tag_segment.mjs";

export function getRoutePath(route: RouteKey, locale: Locale): string {
    return localizedPath(routes[route].path, locale);
}

export function contentPath(item: ContentRecord) {
    return item.data.href;
}

export function tagPath(tag: string, locale: Locale, placement?: string) {
    return taxonomyPath("tag", tag, locale, placement);
}

export function categoryPath(category: string, locale: Locale, placement?: string) {
    return taxonomyPath("category", category, locale, placement);
}

export function taxonomyIndexPath(kind: Taxonomy, locale: Locale, placement?: string) {
    const mounts = getTaxonomyRoutes().filter((mount) => mount.kind === kind);
    const mount = mounts.find((mount) => mount.placement === placement) ?? mounts.find((mount) => ! mount.placement);
    if (! mount) throw new Error(`Missing taxonomy route: ${kind} (${placement ?? "all"})`);
    return getRoutePath(mount.route, locale);
}

export function taxonomyPath(taxonomy: Taxonomy, value: string, locale: Locale, placement?: string) {
    const segment = taxonomy === "tag" ? tagSegment(value) : value;
    return `${taxonomyIndexPath(taxonomy, locale, placement)}${segment}/`;
}

function pageEntry<T>(path: string, props: T) {
    return { params: { path: path.slice(1, -1) || undefined }, props };
}

export function getPageEntries(items: readonly ContentRecord[]) {
    const published = selectContent(items);
    const pages = locales.flatMap((locale) => [
        pageEntry(localizedPath("", locale), { kind: "page" as const, route: "profile" as const, locale }),
        ...(Object.keys(routes) as RouteKey[]).map((route) =>
            pageEntry(getRoutePath(route, locale), { kind: "page" as const, route, locale })),
    ]);
    const entries = published.filter((item) => item.data.entry.type === "markdown")
        .map((item) => pageEntry(contentPath(item), { kind: "content" as const, id: item.id }));
    const taxonomyPages = getTaxonomyRoutes().flatMap(({ route, kind, placement }) => locales.flatMap((locale) =>
        getTaxonomyIndex(published, { kind, locale, placement }).map(({ value }) =>
            pageEntry(taxonomyPath(kind, value, locale, placement), { kind: "taxonomy" as const, route, value, locale }))));
    return [...pages, ...entries, ...taxonomyPages];
}

export function getSectionRoutes(section: SiteSection) {
    return (Object.keys(routes) as RouteKey[]).filter((route) => routes[route].section === section);
}

export function isSectionActive(current: RouteKey | undefined, section: SiteSection): boolean {
    return current ? routes[current].section === section : false;
}
