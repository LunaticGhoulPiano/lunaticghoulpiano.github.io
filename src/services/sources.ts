import type { RouteKey } from "../config/routes.ts";

interface SourceDefinition {
    title: string;
    route: RouteKey;
    load: () => unknown;
}

export function getSourceEntries<Source extends SourceDefinition>(
    definitions: Record<string, Source>,
    route: RouteKey,
    overview: RouteKey,
) {
    return Object.entries(definitions)
        .filter(([, source]) => route === overview || source.route === route)
        .map(([key, { load, ...source }]) => ({
            ...source,
            key,
            data: load() as ReturnType<Source["load"]>,
        }));
}
