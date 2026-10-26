import type { RouteKey } from "../../config/routes.ts";
import { getSourceEntries, getSources } from "../sources.ts";

export const projectSources = getSources("projects");

export function getProjectsPage(route: RouteKey) {
    return {
        section: "projects" as const,
        sources: getSourceEntries(projectSources, route, "projects"),
    };
}

export type ProjectSource = keyof typeof projectSources;
