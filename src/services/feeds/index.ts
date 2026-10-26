import { routes, type RouteKey } from "../../config/routes.ts";
import { languages, type Locale } from "../../config/locales.ts";
import { useTranslations } from "../../i18n/ui.ts";
import { formatMessage } from "../../i18n/format.ts";
import { displayDate } from "../../utils/dates.ts";
import { getSourceEntries, getSources } from "../sources.ts";

export const feedSources = getSources("feeds");

export function getFeedsPage(route: RouteKey, locale: Locale) {
    const sources = getSourceEntries(feedSources, route, "feeds");
    const t = useTranslations(locale);
    const detail = route === "feeds" ? undefined : sources[0];
    const period = detail?.data?.period;
    return {
        section: "feeds" as const,
        sources,
        description: period
            ? formatMessage(t("description.activityPeriod"), {
                from: displayDate(period.from),
                to: displayDate(period.to),
            }, languages[locale].formatLocale)
            : t(routes[route].description),
    };
}

export type FeedSource = keyof typeof feedSources;
