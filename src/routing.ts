import { routes, type RouteKey } from "./config/routes.ts";
import { localizedPath, locales, type Locale } from "./config/locales.ts";
import type { ContentRecord } from "./data/contents_schema.ts";
import type { SiteSection } from "./config/navigation.ts";
import type { Taxonomy } from "./config/content.ts";
import { selectContent } from "./data/taxonomy.ts";
import type { TranslationKey } from "./i18n/ui.ts";

export function getRouteTitle(route: string, titles: Record<TranslationKey, string>): string {
    return Object.hasOwn(routes, route) ? titles[routes[route as RouteKey].title] : route;
}

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

export function taxonomyPath(taxonomy: Taxonomy, value: string, locale: Locale, placement?: string) {
    const parameters = new URLSearchParams({ [taxonomy]: value });
    if (placement) parameters.set("section", placement);
    return `${getRoutePath("search", locale)}?${parameters}`;
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
    return [...pages, ...entries];
}

export function getSectionRoutes(section: SiteSection) {
    return (Object.keys(routes) as RouteKey[]).filter((route) => routes[route].section === section);
}

export function isSectionActive(current: RouteKey | undefined, section: SiteSection): boolean {
    return current ? routes[current].section === section : false;
}
