export const mainNavigation = [
    "profile",
    "feeds",
    "projects",
    "playground",
    "blog",
    "documentations",
] as const;

export type SiteSection = (typeof mainNavigation)[number];
