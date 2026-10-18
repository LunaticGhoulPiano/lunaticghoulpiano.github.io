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
    blog: {
        section: "blog",
        path: "blog",
        title: "route.blog",
        description: "description.blog",
    },
    blogTags: {
        section: "blog",
        path: "blog/tags",
        title: "route.blogTags",
        description: "description.blogTags",
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
} as const satisfies Record<SiteSection, unknown> & Record<
    string,
    {
        section: SiteSection;
        path: string;
        title: TranslationKey;
        description: TranslationKey;
    }
>;

export type RouteKey = keyof typeof routes;

export type SectionRoute<Section extends SiteSection> = {
    [Route in RouteKey]: (typeof routes)[Route]["section"] extends Section ? Route : never;
}[RouteKey];
