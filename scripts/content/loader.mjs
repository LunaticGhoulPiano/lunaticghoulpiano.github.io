import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { routes } from "../../src/config/routes.ts";
import { taxonomies } from "../../src/config/content.ts";
import { locales, localizedPath } from "../../src/config/locales.ts";
import { itemConfigSchema } from "../../src/data/contents_schema.ts";

export function isWithin(root, target) {
    const path = relative(resolve(root), resolve(target));
    return path !== "" && path !== ".." && ! path.startsWith(`..${sep}`) && ! isAbsolute(path);
}

export async function resolveItemFile(directory, path, kind = "file") {
    const target = resolve(directory, path);
    if (! isWithin(directory, target))
        throw new Error(`Entry escapes its item directory: ${path}`);
    const resolved = await realpath(target);
    if (! isWithin(await realpath(directory), resolved))
        throw new Error(`Entry symlink escapes its item directory: ${path}`);
    const info = await stat(resolved);
    if (kind === "file" ? ! info.isFile() : ! info.isDirectory())
        throw new Error(`Invalid entry ${kind}: ${target}`);
    return resolved;
}

export function validateEntries(records) {
    const byId = new Map(records.map((record) => [record.id, record]));
    if (byId.size !== records.length)
        throw new Error("Duplicate localized content ID.");
    const systemPaths = new Set(locales.flatMap((locale) => [
        localizedPath("", locale),
        ...Object.values(routes).map((route) => localizedPath(route.path, locale)),
    ]));
    const publicPaths = new Map();
    for (const record of records) {
        const { entry, href, locale, related } = record.data;
        if (entry.type !== "link") {
            const firstSegment = entry.path.split("/")[1];
            if (locales.includes(firstSegment))
                throw new Error(`Entry paths must not contain a language prefix: ${entry.path}`);
            if (systemPaths.has(href) || locales.some((language) => Object.values(taxonomies).some(({ route }) =>
                href.startsWith(localizedPath(routes[route].path, language)))))
                throw new Error(`Reserved content route: ${href}`);
            if (publicPaths.has(href))
                throw new Error(`Duplicate content route: ${href}`);
            publicPaths.set(href, record);
        }
        for (const targetId of related) {
            const target = byId.get(`${locale}/${targetId}`);
            if (! target || (! record.data.draft && target.data.draft))
                throw new Error(`Invalid content reference in ${record.id}: ${targetId} (${locale})`);
        }
    }
    for (const [path, record] of publicPaths) {
        if (record.data.entry.type !== "site")
            continue;
        if ([...systemPaths].some((systemPath) => systemPath.startsWith(path))
            || [...publicPaths.keys()].some((other) => other !== path && (other.startsWith(path) || path.startsWith(other)))) {
            throw new Error(`Site mount overlaps another route: ${path}`);
        }
    }
}

/** @returns {Promise<import("../../src/data/contents_schema.ts").ContentRecord[]>} */
export async function discoverContent(root) {
    const sourceRoot = join(root, "src", "contents");
    let directories;
    try {
        directories = await readdir(sourceRoot, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    const records = [];
    const ids = new Set();
    for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
        if (! directory.isDirectory() || directory.name.startsWith("."))
            continue;
        const itemDirectory = join(sourceRoot, directory.name);
        const configPath = join(itemDirectory, "configs.json");
        let raw;
        try {
            raw = await readFile(await resolveItemFile(itemDirectory, "./configs.json"), "utf8");
        }
        catch (error) {
            if (error.code === "ENOENT")
                continue;
            throw error;
        }
        let config;
        try {
            config = itemConfigSchema.parse(JSON.parse(raw.replace(/^\uFEFF/, "")));
        }
        catch (error) {
            throw new Error(`Invalid ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (ids.has(config.id))
            throw new Error(`Duplicate content ID: ${config.id}`);
        ids.add(config.id);
        for (const [language, localized] of Object.entries(config.locales)) {
            const locale = language;
            const { entry } = localized;
            let source;
            if (entry.type === "markdown" || entry.type === "astro") {
                source = relative(root, await resolveItemFile(itemDirectory, entry.file)).replaceAll(sep, "/");
                if (entry.type === "markdown" && /^\uFEFF?---(?:\r?\n|$)/.test(await readFile(join(root, source), "utf8"))) {
                    throw new Error(`Put metadata in configs.json, not Markdown frontmatter: ${source}`);
                }
            }
            if (entry.type === "site") {
                const siteRoot = await resolveItemFile(itemDirectory, entry.root, "directory");
                await resolveItemFile(siteRoot, "./index.html");
            }
            records.push({
                id: `${locale}/${config.id}`,
                data: {
                    itemId: config.id,
                    locale,
                    kind: config.kind,
                    category: config.category,
                    tags: [...new Set(config.tags)],
                    placements: [...new Set(config.placements)],
                    related: [...new Set(config.related)],
                    links: config.links,
                    ...localized,
                    href: entry.type === "link" ? entry.url : localizedPath(entry.path, locale),
                    directory: `src/contents/${directory.name}`,
                    ...(source ? { source } : {}),
                },
            });
        }
    }
    validateEntries(records);
    return records;
}

const discoveryKey = Symbol.for("site.contentDiscovery");
const discoveries = globalThis[discoveryKey] ??= new Map();

export function invalidateContent(root) {
    discoveries.delete(resolve(root));
}

export function readContent(root) {
    const key = resolve(root);
    if (! discoveries.has(key)) {
        const pending = discoverContent(key).catch((error) => {
            if (discoveries.get(key) === pending) discoveries.delete(key);
            throw error;
        });
        discoveries.set(key, pending);
    }
    return discoveries.get(key);
}

export function contentLoader() {
    return {
        name: "item-configurations",
        async load(context) {
            const root = fileURLToPath(context.config.root);
            const records = await readContent(root);
            const items = [];
            for (const record of records) {
                if (record.data.draft) continue;
                const data = await context.parseData({ id: record.id, data: record.data });
                const body = record.data.entry.type === "markdown"
                    ? await readFile(join(root, record.data.source), "utf8")
                    : undefined;
                const rendered = body === undefined ? undefined
                    : await context.renderMarkdown(body, { fileURL: pathToFileURL(join(root, record.data.source)) });
                items.push({
                    id: record.id,
                    data,
                    ...(body === undefined ? {} : { body, rendered }),
                    filePath: record.data.source ?? `${record.data.directory}/configs.json`,
                    digest: context.generateDigest({ data, body }),
                });
            }
            context.store.clear();
            for (const item of items) context.store.set(item);
        },
    };
}
