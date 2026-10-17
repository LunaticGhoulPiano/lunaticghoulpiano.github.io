import type { SiteSection } from "../config/navigation.ts";
import { routes, type RouteKey } from "../config/routes.ts";
import type { Locale } from "../config/locales.ts";
import { getProfilePage } from "./profile/index.ts";
import { getProjectsPage } from "./projects/index.ts";
import { getBlogOverview } from "./blog/index.ts";
import { getFeedsPage } from "./feeds/index.ts";

const sectionServices = {
    profile: getProfilePage,
    projects: getProjectsPage,
    blog: (_route: RouteKey, locale: Locale) => getBlogOverview(locale),
    feeds: getFeedsPage,
} satisfies Record<SiteSection, (route: RouteKey, locale: Locale) => unknown>;

export async function getPageContext(route: RouteKey, locale: Locale) {
    return sectionServices[routes[route].section](route, locale);
}
