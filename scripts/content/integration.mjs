import { fileURLToPath } from "node:url";
import { join, relative, extname } from "node:path";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { discoverContent, isWithin } from "./loader.mjs";
import { prepareSite, copySite, siteFile } from "./sites.mjs";

const moduleId = "virtual:content-components";
const resolvedId = "\0" + moduleId;
const statusId = "virtual:content-status";
const mime = {
    ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2",
    ".wasm": "application/wasm", ".ico": "image/x-icon", ".xml": "application/xml",
};
/** @returns {import("astro").AstroIntegration} */
export function itemContent() {
    let root;
    let config;
    let records = [];
    const prepared = new Map();
    const cleanup = async () => {
        const results = await Promise.allSettled(prepared.values());
        prepared.clear();
        for (const result of results) {
            if (result.status === "fulfilled")
                await result.value.dispose();
        }
    };
    const prepare = (item) => {
        if (! prepared.has(item.id))
            prepared.set(item.id, prepareSite(root, item, config.site, records));
        return prepared.get(item.id);
    };
    return {
        name: "item-content",
        hooks: {
            "astro:config:setup": ({ config: current, updateConfig }) => {
                root = fileURLToPath(current.root);
                updateConfig({
                    vite: {
                        plugins: [{
                            name: "item-content-components",
                            resolveId(id) {
                                if (id === statusId) return "\0" + statusId;
                                if (id === moduleId)
                                    return resolvedId;
                            },
                            async load(id) {
                                if (id === "\0" + statusId) {
                                    const records = await discoverContent(root);
                                    return `export default ${records.some((item) => ! item.data.draft)};`;
                                }
                                if (id !== resolvedId)
                                    return;
                                const items = await discoverContent(root);
                                const sources = [...new Set(items.filter((item) => ! item.data.draft && item.data.entry.type === "astro").map((item) => item.data.source))];
                                return `export default { ${sources.map((source) => `${JSON.stringify(source)}: () => import(${JSON.stringify(join(root, source).replaceAll("\\", "/"))})`).join(",")} };`;
                            },
                        }],
                    },
                });
            },
            "astro:config:done": ({ config: current }) => {
                config = current;
            },
            "astro:build:start": async () => {
                records = await discoverContent(root);
                try {
                    for (const item of records) {
                        if (! item.data.draft && item.data.entry.type === "site") await prepare(item);
                    }
                }
                catch (error) {
                    await cleanup();
                    throw error;
                }
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
                        await copySite((await prepare(item)).directory, destination);
                    }
                }
                finally {
                    await cleanup();
                }
            },
            "astro:server:setup": async ({ server, refreshContent, logger }) => {
                records = await discoverContent(root);
                let pending = Promise.resolve();
                server.watcher.on("all", (_event, path) => {
                    const local = relative(join(root, "src", "contents"), path).replaceAll("\\", "/");
                    if (local.split("/").some((part) => ["node_modules", ".docusaurus", "build"].includes(part))) return;
                    if (/^[^/]+\/(?:configs\.json|.+\.md)$/.test(local)) {
                        pending = pending.then(async () => {
                            records = await discoverContent(root);
                            await refreshContent({ loaders: ["item-configurations"] });
                            await cleanup();
                            for (const environment of Object.values(server.environments)) {
                                for (const id of ["\0astro:data-layer-content", resolvedId, "\0" + statusId]) {
                                    const module = environment.moduleGraph.getModuleById(id);
                                    if (module) await environment.reloadModule(module);
                                }
                                environment.hot.send("astro:content-changed", {});
                            }
                            server.environments.client.hot.send({ type: "full-reload", path: "*" });
                        }).catch((error) => logger.error(error.message));
                    }
                    for (const item of records.filter((item) => item.data.entry.type === "site")) {
                        if (isWithin(join(root, item.data.directory), path)) {
                            const previous = prepared.get(item.id);
                            prepared.delete(item.id);
                            if (previous) previous.then((site) => site.dispose(), () => {});
                        }
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
                        const file = await siteFile((await prepare(item)).directory, "/" + pathname.slice(item.data.href.length));
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
            "astro:server:done": cleanup,
        },
    };
}
