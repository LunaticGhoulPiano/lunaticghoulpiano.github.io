import { routes, hasContent, type RouteKey } from "../config/routes.ts";
import { defaultLocale, type Locale } from "../config/locales.ts";
import { getRoutePath } from "../routing.ts";
import { getContent } from "../data/contents";
import { selectContent } from "../data/taxonomy.ts";
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
    const content = hasContent(route) ? await getContent() : [];
    const items = hasContent(route) ? selectContent(content, { placement: route, locale }) : [];
    const service = page.section && page.section in sectionServices ? sectionServices[page.section as keyof typeof sectionServices] : undefined;
    const context = route === "search" ? { section: "search" as const } : service ? service(route, locale) : { section: "content" as const };
    const fallback = hasContent(route) && locale !== defaultLocale && items.length === 0
        && selectContent(content, { placement: route, locale: defaultLocale }).length > 0;
    return {
        ...context,
        items,
        defaultLanguagePath: fallback ? getRoutePath(route, defaultLocale) : null,
    };
}
