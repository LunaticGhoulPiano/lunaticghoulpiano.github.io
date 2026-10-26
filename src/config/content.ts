import type { useMessages } from "../i18n/ui.ts";
import { routes, hasContent, type RouteKey, type ContentRoute } from "./routes.ts";

export const contentRules = {
    slugPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    placements: (Object.keys(routes) as RouteKey[]).filter(hasContent),
    defaultPlacement: "blog" satisfies ContentRoute,
    tocDepths: [2, 3],
} as const;

export const taxonomies = {
    tag: { route: "blogTags", field: "tags", label: "tags", allLabel: "allTags", emptyLabel: "noTags" },
    category: { route: "blogCategories", field: "category", label: "categories", allLabel: "allCategories", emptyLabel: "noCategories" },
} as const satisfies Record<string, {
    route: RouteKey;
    field: "tags" | "category";
    label: keyof ReturnType<typeof useMessages>["content"];
    allLabel: keyof ReturnType<typeof useMessages>["content"];
    emptyLabel: keyof ReturnType<typeof useMessages>["content"];
}>;

export type Taxonomy = keyof typeof taxonomies;
export const taxonomyKinds = Object.keys(taxonomies) as Taxonomy[];
