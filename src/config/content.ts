export const contentRules = {
    slugPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    placements: ["blog", "projects", "studying"],
    tocDepths: [2, 3],
} as const;
