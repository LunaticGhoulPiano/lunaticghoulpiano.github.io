import type { TranslationKey } from "../i18n/ui.ts";
import type { SiteSection } from "./navigation.ts";

export const routes = {
    profile: {
        section: "profile",
        path: "profile",
        title: "route.profile",
        description: "description.profile",
    },
    cv: {
        section: "profile",
        path: "profile/cv",
        title: "route.cv",
        description: "description.cv",
    },
    interests: {
        section: "profile",
        path: "profile/interests",
        title: "route.interests",
        description: "description.interests",
    },
    studying: {
        content: true,
        section: "profile",
        path: "profile/recent-studying",
        title: "route.studying",
        description: "description.studying",
    },
    contact: {
        section: "profile",
        path: "profile/contact",
        title: "route.contact",
        description: "description.contact",
    },
    projects: {
        content: true,
        section: "projects",
        path: "projects",
        title: "route.projects",
        description: "description.projects",
    },
    githubProjects: {
        section: "projects",
        path: "projects/github",
        title: "route.githubProjects",
        description: "description.githubProjects",
    },
    youtubeProjects: {
        section: "projects",
        path: "projects/youtube",
        title: "route.youtubeProjects",
        description: "description.youtubeProjects",
    },
    mymusic5Projects: {
        section: "projects",
        path: "projects/mymusic5",
        title: "route.mymusic5Projects",
        description: "description.mymusic5Projects",
    },
    playground: {
        content: true,
        empty: "empty.playground",
        section: "playground",
        path: "playground",
        title: "route.playground",
        description: "description.playground",
    },
    blog: {
        content: true,
        empty: "empty.blog",
        section: "blog",
        path: "blog",
        title: "route.blog",
        description: "description.blog",
    },
    documentations: {
        content: true,
        empty: "empty.documentations",
        section: "documentations",
        path: "documentations",
        title: "route.documentations",
        description: "description.documentations",
    },
    search: {
        section: null,
        path: "search",
        title: "route.search",
        description: "description.search",
    },
    feeds: {
        section: "feeds",
        path: "feeds",
        title: "route.feeds",
        description: "description.feeds",
    },
    github: {
        section: "feeds",
        path: "feeds/github",
        title: "route.github",
        description: "description.github",
    },
    youtube: {
        section: "feeds",
        path: "feeds/youtube",
        title: "route.youtube",
        description: "description.youtube",
    },
    mymusic5: {
        section: "feeds",
        path: "feeds/mymusic5",
        title: "route.mymusic5",
        description: "description.mymusic5",
    },
} as const satisfies Record<SiteSection, unknown> & Record<
    string,
    {
        section: SiteSection | null;
        path: string;
        title: TranslationKey;
        description: TranslationKey;
        content?: boolean;
        empty?: TranslationKey;
    }
>;

export type RouteKey = keyof typeof routes;

export type ContentRoute = {
    [Route in RouteKey]: (typeof routes)[Route] extends { content: true } ? Route : never;
}[RouteKey];

export function hasContent(route: RouteKey): route is ContentRoute {
    return "content" in routes[route] && routes[route].content === true;
}

export type SectionRoute<Section extends SiteSection> = {
    [Route in RouteKey]: (typeof routes)[Route]["section"] extends Section ? Route : never;
}[RouteKey];
