import { routes, type RouteKey } from "../../config/routes.ts";
import { languages, type Locale } from "../../config/locales.ts";
import { useTranslations, type TranslationKey } from "../../i18n/ui.ts";
import { formatMessage } from "../../i18n/format.ts";
import { displayDate } from "../../utils/dates.ts";
import { getGithubFeed } from "./github.ts";
import { getYoutubeContent } from "../../data/youtube/content.ts";
import { getMymusic5Content } from "../../data/mymusic5/content.ts";
import { getSourceEntries } from "../sources.ts";

export const feedSources = {
    github: {
        title: "GitHub",
        route: "github",
        periodDescription: "description.activityPeriod",
        load: getGithubFeed,
    },
    youtube: {
        title: "YouTube",
        route: "youtube",
        periodDescription: "description.activityPeriod",
        load: () => getYoutubeContent(),
    },
    mymusic5: {
        title: "MyMusic5",
        route: "mymusic5",
        periodDescription: "description.activityPeriod",
        load: () => getMymusic5Content(),
    },
} as const satisfies Record<string, {
    title: string;
    route: RouteKey;
    periodDescription: TranslationKey;
    load: () => {
        period: {
            from: string;
            to: string;
        } | null;
    } | null;
}>;

export function getFeedsPage(route: RouteKey, locale: Locale) {
    const sources = getSourceEntries(feedSources, route, "feeds");
    const t = useTranslations(locale);
    const detail = route === "feeds" ? undefined : sources[0];
    const period = detail?.data?.period;
    return {
        section: "feeds" as const,
        sources,
        description: detail && period
            ? formatMessage(t(detail.periodDescription), {
                from: displayDate(period.from),
                to: displayDate(period.to),
            }, languages[locale].formatLocale)
            : t(routes[route].description),
    };
}

export type FeedSource = keyof typeof feedSources;
