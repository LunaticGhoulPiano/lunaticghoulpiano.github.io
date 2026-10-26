import type { TranslationKey } from "../i18n/ui.ts";
import type { SiteSection } from "./navigation.ts";
import type { Taxonomy } from "./content.ts";

export interface TaxonomyMount {
    kind: Taxonomy;
    placement?: string;
}

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
    blog: {
        content: true,
        taxonomies: ["tag", "category"],
        empty: "empty.blog",
        section: "blog",
        path: "blog",
        title: "route.blog",
        description: "description.blog",
    },
    tags: {
        taxonomy: { kind: "tag" },
        section: "blog",
        path: "blog/tags",
        title: "route.tags",
        description: "description.tags",
    },
    categories: {
        taxonomy: { kind: "category" },
        section: "blog",
        path: "blog/categories",
        title: "route.categories",
        description: "description.categories",
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
        section: SiteSection;
        path: string;
        title: TranslationKey;
        description: TranslationKey;
        content?: boolean;
        empty?: TranslationKey;
        taxonomies?: readonly Taxonomy[];
        taxonomy?: TaxonomyMount;
    }
>;

export type RouteKey = keyof typeof routes;

export function getTaxonomyRoutes(): (TaxonomyMount & { route: RouteKey })[] {
    return (Object.keys(routes) as RouteKey[]).flatMap((route) => {
        const page = routes[route];
        return "taxonomy" in page ? [{ route, ...page.taxonomy }] : [];
    });
}

export type ContentRoute = {
    [Route in RouteKey]: (typeof routes)[Route] extends { content: true } ? Route : never;
}[RouteKey];

export function hasContent(route: RouteKey): route is ContentRoute {
    return "content" in routes[route] && routes[route].content === true;
}

export type SectionRoute<Section extends SiteSection> = {
    [Route in RouteKey]: (typeof routes)[Route]["section"] extends Section ? Route : never;
}[RouteKey];
