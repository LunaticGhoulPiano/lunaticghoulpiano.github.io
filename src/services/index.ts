import { routes, hasContent, type RouteKey } from "../config/routes.ts";
import { defaultLocale, type Locale } from "../config/locales.ts";
import { getRoutePath } from "../routing.ts";
import { getContent, selectContent } from "../data/contents";
import { getProfilePage } from "./profile/index.ts";
import { getProjectsPage } from "./projects/index.ts";
import { getBlogOverview } from "./blog/index.ts";
import { getFeedsPage } from "./feeds/index.ts";

const sectionServices = {
    profile: getProfilePage,
    projects: getProjectsPage,
    blog: getBlogOverview,
    feeds: getFeedsPage,
};

export async function getPageContext(route: RouteKey, locale: Locale) {
    const page = routes[route];
    const content = hasContent(route) || page.section === "blog" ? await getContent() : [];
    const items = hasContent(route) ? selectContent(content, { placement: route, locale }) : [];
    const context = sectionServices[page.section](route, locale, content);
    const fallback = hasContent(route) && locale !== defaultLocale && items.length === 0
        && selectContent(content, { placement: route, locale: defaultLocale }).length > 0;
    return {
        ...context,
        items,
        defaultLanguagePath: fallback ? getRoutePath(route, defaultLocale) : null,
    };
}
