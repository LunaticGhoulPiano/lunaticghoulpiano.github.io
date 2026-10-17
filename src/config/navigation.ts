export const mainNavigation = [
    "profile",
    "projects",
    "blog",
    "feeds",
] as const;

export type SiteSection = (typeof mainNavigation)[number];
