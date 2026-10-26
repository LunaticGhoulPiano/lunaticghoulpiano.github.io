import type { RouteKey } from "../config/routes.ts";
import { socialLinks } from "../config/social.ts";
import { getGithubData } from "../data/github/store.ts";
import { getYoutubeContent } from "../data/youtube/content.ts";
import { getMymusic5Content, mymusic5SearchText } from "../data/mymusic5/content.ts";
import { getGithubFeed, githubActivity } from "./feeds/github.ts";
import type { SearchDocument } from "../data/search.ts";
import { youtubeVideoUrl } from "../config/youtube.ts";
import { mymusic5Url } from "../config/mymusic5.ts";
import { languages, locales } from "../config/locales.ts";
import { useMessages } from "../i18n/ui.ts";
import { formatMessage } from "../i18n/format.ts";
import { mymusic5FeedSheetLimit, youtubeFeedVideoLimit } from "../config/collections.ts";

interface SourceSearchEntry {
    id: string;
    data: Pick<SearchDocument["data"], "title" | "href" | "date" | "dateKind" | "placements">
        & Partial<SearchDocument["data"]>;
}

const titles = Object.fromEntries(socialLinks.map(({ platform, label }) => [platform, label]));

export const sourceDefinitions = {
    github: {
        title: titles.github,
        feeds: { route: "github", load: getGithubFeed },
        projects: {
            route: "githubProjects",
            load: () => {
                const snapshot = getGithubData().repositories;
                return { notice: snapshot, repositories: snapshot?.data ?? [] };
            },
        },
        search(): SourceSearchEntry[] {
            const github = getGithubData();
            return [
                ...(github.repositories?.data ?? []).map((repository): SourceSearchEntry => ({
                    id: `repository:${repository.id}`,
                    data: {
                        title: repository.fullName, description: repository.description ?? "", body: repository.language ?? "",
                        href: repository.url, placements: ["projects"],
                        date: repository.updatedAt, updated: repository.updatedAt, dateKind: "updated",
                    },
                })),
                ...githubActivity(github.activity, github.contributions).entries.flatMap((entry) => {
                    if (entry.type === "PrivateContribution") return [];
                    const event = github.activity?.data.find((event) => event.id === entry.id);
                    return locales.map((locale): SourceSearchEntry => {
                        const copy = useMessages(locale);
                        return {
                            id: `activity:${entry.id}`,
                            data: {
                                locale,
                                title: `${copy.events[entry.type]} · ${entry.repository}`,
                                description: [event?.title, event?.action, entry.type === "Commit" ? formatMessage(copy.activity.commitCount, { count: entry.quantity }, languages[locale].formatLocale) : ""].filter(Boolean).join(" · "),
                                href: entry.url, placements: ["feeds"], date: entry.occurredAt, dateKind: "event",
                            },
                        };
                    });
                }),
            ];
        },
    },
    youtube: {
        title: titles.youtube,
        feeds: { route: "youtube", load: getYoutubeContent },
        projects: { route: "youtubeProjects", load: getYoutubeContent },
        search(): SourceSearchEntry[] {
            const youtube = getYoutubeContent();
            const recent = new Set(youtube.videos.slice(0, youtubeFeedVideoLimit).map((video) => video.id));
            return [
                ...youtube.library.map((video): SourceSearchEntry => ({
                    id: `video:${video.id}`,
                    data: {
                        title: video.title, description: video.description, href: youtubeVideoUrl(video.id),
                        placements: recent.has(video.id) ? ["projects", "feeds"] : ["projects"],
                        date: video.publishedAt, dateKind: "published",
                    },
                })),
                ...youtube.playlists.map((playlist): SourceSearchEntry => ({
                    id: `playlist:${playlist.id}`,
                    data: {
                        title: playlist.title, description: playlist.description, href: `https://www.youtube.com/playlist?list=${playlist.id}`,
                        placements: ["projects"], date: playlist.createdAt, dateKind: "published",
                    },
                })),
            ];
        },
    },
    mymusic5: {
        title: titles.mymusic5,
        feeds: { route: "mymusic5", load: getMymusic5Content },
        projects: { route: "mymusic5Projects", load: getMymusic5Content },
        search(): SourceSearchEntry[] {
            const { sheets, author } = getMymusic5Content();
            if (! author) return [];
            const recent = new Set(sheets.slice(0, mymusic5FeedSheetLimit).map((sheet) => sheet.sheetId));
            return sheets.map((sheet) => ({
                id: `sheet:${sheet.sheetId}`,
                data: {
                    title: sheet.title, description: sheet.description, body: mymusic5SearchText(sheet),
                    href: mymusic5Url(author.artistUrl, sheet.sheetId),
                    placements: recent.has(sheet.sheetId) ? ["projects", "feeds"] : ["projects"],
                    date: sheet.createdAt, updated: sheet.updatedAt, dateKind: "published",
                },
            }));
        },
    },
} as const;

export type SourceKey = keyof typeof sourceDefinitions;
export type SourceSection = Exclude<keyof (typeof sourceDefinitions)[SourceKey], "title" | "search">;

export function getSourceSearchDocuments(
    definitions: Record<string, { title: string; search?: () => SourceSearchEntry[] }> = sourceDefinitions,
): SearchDocument[] {
    return Object.entries(definitions).flatMap(([key, source]) => (source.search?.() ?? []).map(({ id, data }) => ({
        id: `${key}:${id}`,
        data: { locale: "", category: "", tags: [], body: "", description: "", sources: [source.title], ...data },
    })));
}

interface SourceDefinition {
    title: string;
    route: RouteKey;
    load: () => { notice: { lastSuccessfulFetchAt: string } | null };
}

type RegisteredSources<Section extends SourceSection> = {
    [Key in SourceKey]: {
        title: string;
        route: (typeof sourceDefinitions)[Key][Section]["route"];
        load: (typeof sourceDefinitions)[Key][Section]["load"];
    };
};

export function getSources<Section extends SourceSection>(section: Section): RegisteredSources<Section> {
    return Object.fromEntries(Object.entries(sourceDefinitions).map(([key, source]) => [
        key, { title: source.title, route: source[section].route, load: source[section].load },
    ])) as RegisteredSources<Section>;
}

export type SourceEntry<Definitions extends Record<string, SourceDefinition>> = {
    [Key in keyof Definitions]: Omit<Definitions[Key], "load"> & {
        key: Key;
        data: ReturnType<Definitions[Key]["load"]>;
    };
}[keyof Definitions];

export type SourceData<Section extends SourceSection, Key extends SourceKey> = ReturnType<RegisteredSources<Section>[Key]["load"]>;

export type PageSource = {
    [Section in SourceSection]: SourceEntry<RegisteredSources<Section>>;
}[SourceSection];

export function getSourceEntries<Definitions extends Record<string, SourceDefinition>>(
    definitions: Definitions,
    route: RouteKey,
    overview: RouteKey,
): SourceEntry<Definitions>[] {
    return Object.entries(definitions)
        .filter(([, source]) => route === overview || source.route === route)
        .map(([key, { load, ...source }]) => ({ ...source, key, data: load() })) as SourceEntry<Definitions>[];
}
