import { routes, hasContent, getTaxonomyRoutes, type RouteKey } from "../config/routes.ts";
import { defaultLocale, type Locale } from "../config/locales.ts";
import { taxonomies } from "../config/content.ts";
import { getRoutePath, taxonomyIndexPath, taxonomyPath } from "../routing.ts";
import { getContent, type ContentEntry } from "../data/contents";
import { selectContent, taxonomyName, getTaxonomyIndex, getTaxonomyItems } from "../data/taxonomy.ts";
import { getProfilePage } from "./profile/index.ts";
import { getProjectsPage } from "./projects/index.ts";
import { getFeedsPage } from "./feeds/index.ts";

const sectionServices = {
    profile: getProfilePage,
    projects: getProjectsPage,
    feeds: getFeedsPage,
};

export async function getPageContext(route: RouteKey, locale: Locale) {
    const page = routes[route];
    const mount = getTaxonomyRoutes().find((mount) => mount.route === route);
    const content = hasContent(route) || mount ? await getContent() : [];
    const items = hasContent(route) ? selectContent(content, { placement: route, locale }) : [];
    const service = page.section in sectionServices ? sectionServices[page.section as keyof typeof sectionServices] : undefined;
    const context = mount ? {
        section: "taxonomy" as const,
        taxonomy: {
            kind: mount.kind,
            entries: getTaxonomyIndex(content, { ...mount, locale }).map((entry) => ({
                ...entry, href: taxonomyPath(mount.kind, entry.value, locale, mount.placement),
            })),
        },
    } : service ? service(route, locale) : { section: "content" as const };
    const fallback = hasContent(route) && locale !== defaultLocale && items.length === 0
        && selectContent(content, { placement: route, locale: defaultLocale }).length > 0;
    return {
        ...context,
        items,
        taxonomyNavigation: ("taxonomies" in page ? page.taxonomies : []).map((kind) => ({
            label: taxonomies[kind].label,
            href: taxonomyIndexPath(kind, locale, route),
        })),
        defaultLanguagePath: fallback ? getRoutePath(route, defaultLocale) : null,
    };
}

export function getTaxonomyContext(route: RouteKey, value: string, locale: Locale, content: readonly ContentEntry[]) {
    const mount = getTaxonomyRoutes().find((mount) => mount.route === route);
    if (! mount) throw new Error(`Not a taxonomy route: ${route}`);
    const { kind, placement } = mount;
    const items = getTaxonomyItems(content, { kind, value, placement });
    return {
        locale,
        route,
        placement,
        title: taxonomyName(kind, value, locale),
        allLabel: taxonomies[kind].allLabel,
        indexHref: taxonomyIndexPath(kind, locale, placement),
        path: taxonomyPath(kind, value, locale, placement),
        items: selectContent(items, { locale }),
        languagePaths: Object.fromEntries(items.map((item) => [item.data.locale, taxonomyPath(kind, value, item.data.locale, placement)])),
    };
}
