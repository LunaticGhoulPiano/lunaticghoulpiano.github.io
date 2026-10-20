import type { RouteKey } from "../../config/routes.ts";
import { getGithubData } from "../../data/github/store.ts";
import { getYoutubeContent } from "../../data/youtube/content.ts";
import { getMymusic5Data } from "../../data/mymusic5/store.mjs";
import { getSourceEntries } from "../sources.ts";

export const projectSources = {
    github: {
        title: "GitHub",
        route: "githubProjects",
        load: () => {
            const snapshot = getGithubData().repositories;
            return {
                notice: snapshot,
                repositories: snapshot?.data ?? [],
            };
        },
    },
    youtube: {
        title: "YouTube",
        route: "youtubeProjects",
        load: () => getYoutubeContent(),
    },
    mymusic5: {
        title: "MyMusic5",
        route: "mymusic5Projects",
        load: () => {
            const snapshot = getMymusic5Data();
            return {
                notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
                author: snapshot?.author ?? null,
                sheets: snapshot?.sheets ?? [],
            };
        },
    },
} as const;

export function getProjectsPage(route: RouteKey) {
    return {
        section: "projects" as const,
        sources: getSourceEntries(projectSources, route, "projects"),
    };
}

export type ProjectSource = keyof typeof projectSources;
