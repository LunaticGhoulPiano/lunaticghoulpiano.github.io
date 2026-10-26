import type { Locale } from "../../config/locales";
import type { RouteKey } from "../../config/routes";
import { taxonomies, taxonomyKinds, type Taxonomy } from "../../config/content";
import { getContent, selectContent, type ContentEntry } from "../../data/contents";
import { taxonomyName, taxonomyValues } from "../../data/tags";
import { getRoutePath, taxonomyPath } from "../../routing";

export function getBlogOverview(route: RouteKey, locale: Locale, items: ContentEntry[]) {
    const navigation = taxonomyKinds.map((kind) => ({
        kind,
        label: taxonomies[kind].label,
        href: getRoutePath(taxonomies[kind].route, locale),
    }));
    const kind = taxonomyKinds.find((kind) => taxonomies[kind].route === route);
    const counts = new Map<string, number>();
    if (kind) {
        for (const item of selectContent(items, { locale })) {
            for (const value of taxonomyValues(item.data, kind)) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }
    return {
        section: "blog" as const,
        navigation,
        taxonomy: kind ? {
            emptyLabel: taxonomies[kind].emptyLabel,
            entries: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({
                title: taxonomyName(kind, value, locale), count, href: taxonomyPath(kind, value, locale),
            })),
        } : null,
    };
}

export async function getTaxonomyContext(taxonomy: Taxonomy, value: string, locale: Locale) {
    const items = selectContent(await getContent(), { taxonomy: { kind: taxonomy, value } });
    return {
        route: taxonomies[taxonomy].route,
        title: taxonomyName(taxonomy, value, locale),
        allLabel: taxonomies[taxonomy].allLabel,
        path: taxonomyPath(taxonomy, value, locale),
        items: selectContent(items, { locale }),
        languagePaths: Object.fromEntries(items.map((item) => [item.data.locale, taxonomyPath(taxonomy, value, item.data.locale)])),
    };
}
