import type { RouteKey } from "../config/routes.ts";
import { socialLinks } from "../config/social.ts";
import { getGithubData } from "../data/github/store.ts";
import { getYoutubeContent } from "../data/youtube/content.ts";
import { getMymusic5Content } from "../data/mymusic5/content.ts";
import { getGithubFeed } from "./feeds/github.ts";

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
    },
    youtube: {
        title: titles.youtube,
        feeds: { route: "youtube", load: getYoutubeContent },
        projects: { route: "youtubeProjects", load: getYoutubeContent },
    },
    mymusic5: {
        title: titles.mymusic5,
        feeds: { route: "mymusic5", load: getMymusic5Content },
        projects: { route: "mymusic5Projects", load: getMymusic5Content },
    },
} as const;

export type SourceKey = keyof typeof sourceDefinitions;
export type SourceSection = Exclude<keyof (typeof sourceDefinitions)[SourceKey], "title">;

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
