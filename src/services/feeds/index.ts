import { routes, type RouteKey, type SectionRoute } from "../../config/routes.ts";
import { languages, type Locale } from "../../config/locales.ts";
import { useTranslations, type TranslationKey } from "../../i18n/ui.ts";
import { formatMessage } from "../../i18n/format.ts";
import { displayDate } from "../../utils/dates.ts";
import { getGithubFeed } from "./github.ts";
import { getYoutubeFeed } from "./youtube.ts";

export type FeedSource = Exclude<SectionRoute<"feeds">, "feeds">;

export const feedSources = {
    github: {
        title: "GitHub",
        periodDescription: "description.activityPeriod",
        load: getGithubFeed,
    },
    youtube: {
        title: "YouTube",
        periodDescription: "description.activityPeriod",
        load: ({ preview }: { preview: boolean }) => preview ? getYoutubeFeed() : null,
    },
} as const satisfies Record<FeedSource, {
    title: string;
    periodDescription: TranslationKey;
    load: (options: { preview: boolean }) => {
        period: {
            from: string;
            to: string;
        } | null;
    } | null;
}>;

export function getFeedsPage(route: RouteKey, locale: Locale) {
    const preview = route === "feeds";
    const sources = (Object.keys(feedSources) as FeedSource[])
        .filter((key) => preview || key === route)
        .map((key) => {
            const { load, ...source } = feedSources[key];
            return {
                ...source,
                key,
                route: key,
                data: load({ preview }),
            };
        });
    const t = useTranslations(locale);
    const detail = preview ? undefined : sources[0];
    const period = detail?.data?.period;
    return {
        section: "feeds" as const,
        preview,
        sources,
        description: detail && period
            ? formatMessage(t(detail.periodDescription), {
                from: displayDate(period.from),
                to: displayDate(period.to),
            }, languages[locale].formatLocale)
            : t(routes[route].description),
    };
}

export type FeedData = NonNullable<ReturnType<(typeof feedSources)[FeedSource]["load"]>>;
