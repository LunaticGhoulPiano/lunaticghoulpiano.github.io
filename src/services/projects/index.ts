import { getGithubData } from "../../data/github/store.ts";

export function getProjectsPage() {
    const snapshot = getGithubData().repositories;
    const repositories = snapshot?.data ?? [];
    return {
        section: "projects" as const,
        snapshot,
        repositories,
    };
}
