import { routes, type RouteKey } from "./config/routes.ts";
import { localizedPath, locales, type Locale } from "./config/locales.ts";
import type { Post } from "./content/store.ts";
import type { SiteSection } from "./config/navigation.ts";

export function getRoutePath(route: RouteKey, locale: Locale): string {
    return localizedPath(routes[route].path, locale);
}

export function postPath(post: Post) {
    return `${getRoutePath("blog", post.data.locale)}${post.data.pathSlug}/`;
}

export function tagPath(tag: string, locale: Locale) {
    return `${getRoutePath("blogTags", locale)}${tag}/`;
}

function pageEntry<T>(path: string, props: T) {
    return {
        params: {
            path: path.slice(1, -1) || undefined,
        },
        props,
    };
}

export function getPageEntries(posts: readonly Post[]) {
    const landingPages = locales.map((locale) => pageEntry(localizedPath("", locale), {
        kind: "page" as const,
        route: "profile" as const,
        locale,
    }));
    const pages = locales.flatMap((locale) => (Object.keys(routes) as RouteKey[]).map((route) =>
        pageEntry(getRoutePath(route, locale), {
            kind: "page" as const,
            route,
            locale,
        }),
    ));
    const articles = posts.map((post) => pageEntry(postPath(post), {
        kind: "post" as const,
        post,
    }));
    const tags = new Map<string, {
        tag: string;
        locale: Locale;
    }>();
    for (const post of posts) {
        for (const tag of post.data.tags) tags.set(tagPath(tag, post.data.locale), {
            tag,
            locale: post.data.locale,
        });
    }
    return [
        ...landingPages,
        ...pages,
        ...articles,
        ...[...tags].map(([path, props]) => pageEntry(path, {
            kind: "tag" as const,
            ...props,
        })),
    ];
}

export function getSectionRoutes(section: SiteSection) {
    return (Object.keys(routes) as RouteKey[]).filter((route) => routes[route].section === section);
}

export function isSectionActive(current: RouteKey | undefined, section: SiteSection): boolean {
    if (! current) return false;
    return routes[current].section === section;
}
