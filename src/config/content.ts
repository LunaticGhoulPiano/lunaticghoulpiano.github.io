export const contentRules = {
    slugPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    articleTypes: ["article", "note"],
    projectStatuses: ["active", "completed", "paused", "archived"],
    studyingStatuses: ["planned", "in-progress", "completed", "paused"],
    tocDepths: [2, 3],
} as const;
