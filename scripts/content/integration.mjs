import { fileURLToPath } from "node:url";
import { join, relative, extname } from "node:path";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { readContent, invalidateContent, isWithin } from "./loader.mjs";
import { prepareSite, copySite, siteFile } from "./sites.mjs";

const statusId = "virtual:content-status";
const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2",
    ".wasm": "application/wasm", ".ico": "image/x-icon", ".xml": "application/xml",
};

function astroRoutes(records) {
    return records.filter((item) => ! item.data.draft && item.data.entry.type === "astro")
        .map((item) => ({ id: item.id, path: item.data.href, source: item.data.source }));
}

/** @returns {import("astro").AstroIntegration} */
export function itemContent() {
    let root;
    let records = [];
    let routeManifest;
    let routeSignature;
    return {
        name: "item-content",
        hooks: {
            "astro:config:setup": async ({ config: current, updateConfig, injectRoute, createCodegenDir, addWatchFile }) => {
                root = fileURLToPath(current.root);
                invalidateContent(root);
                records = await readContent(root);
                const routes = astroRoutes(records);
                const directory = createCodegenDir();
                const entrypoints = new Set();
                for (const route of routes) {
                    const filename = `${route.id.replaceAll("/", "_")}.astro`;
                    entrypoints.add(filename);
                    const entrypoint = new URL(filename, directory);
                    const source = join(root, route.source).replaceAll("\\", "/");
                    const content = join(root, "src/data/contents.ts").replaceAll("\\", "/");
                    await writeFile(entrypoint, `---
import Component from ${JSON.stringify(source)};
import { getContent, getContentContext } from ${JSON.stringify(content)};

const items = await getContent();
const item = items.find((item) => item.id === ${JSON.stringify(route.id)});
if (! item) throw new Error(${JSON.stringify(`Missing content: ${route.id}`)});
const context = getContentContext(item, items);
---

<Component item={item} locale={item.data.locale} {...context} />
`);
                    injectRoute({ pattern: route.path, entrypoint, prerender: true });
                }
                for (const filename of await readdir(directory)) {
                    if (filename.endsWith(".astro") && ! entrypoints.has(filename)) await unlink(new URL(filename, directory));
                }
                routeManifest = new URL("routes.json", directory);
                routeSignature = JSON.stringify(routes);
                const previous = await readFile(routeManifest, "utf8").catch((error) => {
                    if (error.code === "ENOENT") return;
                    throw error;
                });
                if (previous !== routeSignature) await writeFile(routeManifest, routeSignature);
                addWatchFile(routeManifest);
                updateConfig({
                    vite: {
                        plugins: [{
                            name: "item-content-status",
                            resolveId(id) {
                                if (id === statusId) return "\0" + statusId;
                            },
                            async load(id) {
                                if (id === "\0" + statusId) {
                                    const records = await readContent(root);
                                    return `export default ${records.some((item) => ! item.data.draft)};`;
                                }
                            },
                        }],
                    },
                });
            },
            "astro:build:start": async () => {
                records = await readContent(root);
            },
            "astro:build:done": async ({ dir }) => {
                try {
                    const output = fileURLToPath(dir);
                    for (const item of records) {
                        if (item.data.draft || item.data.entry.type !== "site")
                            continue;
                        const destination = join(output, item.data.href);
                        if (! isWithin(output, destination))
                            throw new Error("Site mount escapes the build directory.");
                        const exists = await access(destination).then(() => true, () => false);
                        if (exists)
                            throw new Error(`Site mount would overwrite generated output: ${item.data.href}`);
                        await copySite((await prepareSite(root, item)).directory, destination);
                    }
                }
                finally {
                    invalidateContent(root);
                }
            },
            "astro:server:setup": async ({ server, refreshContent, logger }) => {
                records = await readContent(root);
                let pending = Promise.resolve();
                server.watcher.add(fileURLToPath(routeManifest));
                server.watcher.on("all", (_event, path) => {
                    const local = relative(join(root, "src", "contents"), path).replaceAll("\\", "/");
                    if (local.split("/").includes("node_modules")) return;
                    if (/^[^/]+\/(?:configs\.json|.+\.md)$/.test(local)) {
                        pending = pending.then(async () => {
                            invalidateContent(root);
                            records = await readContent(root);
                            await refreshContent({ loaders: ["item-configurations"] });
                            const signature = JSON.stringify(astroRoutes(records));
                            if (signature !== routeSignature) {
                                routeSignature = signature;
                                await writeFile(routeManifest, signature);
                                return;
                            }
                            for (const environment of Object.values(server.environments)) {
                                for (const id of ["\0astro:data-layer-content", "\0" + statusId]) {
                                    const module = environment.moduleGraph.getModuleById(id);
                                    if (module) await environment.reloadModule(module);
                                }
                                environment.hot.send("astro:content-changed", {});
                            }
                            server.environments.client.hot.send({ type: "full-reload", path: "*" });
                        }).catch((error) => logger.error(error.message));
                    }
                });
                server.middlewares.use(async (request, response, next) => {
                    try {
                        const url = new URL(request.url ?? "/", "http://localhost");
                        const pathname = decodeURIComponent(url.pathname);
                        const item = records.filter((item) => ! item.data.draft && item.data.entry.type === "site").find((site) => pathname.startsWith(site.data.href) || pathname + "/" === site.data.href);
                        if (! item)
                            return next();
                        if (! pathname.endsWith("/") && pathname + "/" === item.data.href) {
                            response.writeHead(302, { Location: item.data.href + url.search });
                            return response.end();
                        }
                        const file = await siteFile((await prepareSite(root, item)).directory, "/" + pathname.slice(item.data.href.length));
                        if (! file) {
                            response.statusCode = 404;
                            return response.end("Not found");
                        }
                        response.setHeader("Content-Type", mime[extname(file)] ?? "application/octet-stream");
                        if (request.method === "HEAD")
                            return response.end();
                        createReadStream(file).on("error", next).pipe(response);
                    }
                    catch (error) {
                        next(error);
                    }
                });
            },
            "astro:server:done": () => {
                invalidateContent(root);
            },
        },
    };
}
