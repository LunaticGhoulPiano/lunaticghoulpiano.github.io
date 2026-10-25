import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { isWithin, resolveItemFile } from "./loader.mjs";

export async function prepareSite(root, item, siteUrl, siblings = []) {
    const { entry, href, locale } = item.data;
    if (entry.type !== "site")
        throw new Error("Expected a standalone site.");
    const siteRoot = await resolveItemFile(join(root, item.data.directory), entry.root, "directory");
    if (entry.engine === "static")
        return { directory: siteRoot, dispose: async () => { } };
    const require = createRequire(join(siteRoot, "package.json"));
    let packagePath;
    try {
        packagePath = require.resolve("@docusaurus/core/package.json");
    }
    catch {
        throw new Error(`Install the Docusaurus project's dependencies before building: ${siteRoot}`);
    }
    const packageData = JSON.parse(await readFile(packagePath, "utf8"));
    const executable = resolve(dirname(packagePath), typeof packageData.bin === "string" ? packageData.bin : packageData.bin.docusaurus);
    const configName = entry.config ?? (await readdir(siteRoot)).find((name) => /^docusaurus\.config\.(ts|mjs|js|cjs)$/.test(name));
    if (! configName)
        throw new Error(`Missing Docusaurus configuration: ${siteRoot}`);
    const original = await resolveItemFile(siteRoot, configName);
    const temporaryRoot = join(root, "temp");
    await mkdir(temporaryRoot, { recursive: true });
    const temporary = await mkdtemp(join(temporaryRoot, "content_site_"));
    const dispose = async () => {
        if (! isWithin(temporaryRoot, temporary))
            throw new Error("Invalid standalone site temporary directory.");
        await rm(temporary, { recursive: true, force: true });
    };
    try {
        const wrapper = join(temporary, "docusaurus.config.mjs");
        const output = join(temporary, "output");
        const mounts = Object.fromEntries([item, ...siblings].filter((other) => ! other.data.draft && other.data.itemId === item.data.itemId && other.data.entry.type === "site")
            .map((other) => [other.data.locale, { url: new URL(siteUrl).origin, baseUrl: other.data.href }]));
        await writeFile(wrapper, `import original from ${JSON.stringify(pathToFileURL(original).href)};
import { resolve } from "node:path";

export default async function () {
    const config = typeof original === "function" ? await original() : await original;
    const mounts = ${JSON.stringify(mounts)};
    const configured = config.i18n ?? { defaultLocale: ${JSON.stringify(locale)}, locales: [${JSON.stringify(locale)}] };
    return {
        ...config,
        url: ${JSON.stringify(new URL(siteUrl).origin)},
        baseUrl: ${JSON.stringify(href)},
        trailingSlash: true,
        i18n: {
            ...configured,
            path: resolve(${JSON.stringify(dirname(original))}, configured.path ?? "i18n"),
            locales: Object.keys(mounts),
            defaultLocale: Object.hasOwn(mounts, configured.defaultLocale) ? configured.defaultLocale : ${JSON.stringify(locale)},
            localeConfigs: Object.fromEntries(Object.entries(mounts).map(([language, mount]) => [
                language, { ...configured.localeConfigs?.[language], ...mount }
            ]))
        }
    };
}
`);
        await new Promise((accept, reject) => {
            const child = spawn(process.execPath, [executable, "build", siteRoot, "--config", wrapper, "--out-dir", output, "--locale", locale], {
                cwd: siteRoot,
                stdio: "inherit",
                windowsHide: true,
            });
            child.on("error", reject);
            child.on("exit", (code) => code === 0 ? accept() : reject(new Error(`Docusaurus build failed for ${item.id} (exit ${code}).`)));
        });
        await resolveItemFile(output, "./index.html");
        return { directory: output, dispose };
    }
    catch (error) {
        await dispose();
        throw error;
    }
}

export async function copySite(source, destination) {
    const files = await readdir(source, { recursive: true, withFileTypes: true });
    for (const file of files) {
        if (file.isSymbolicLink())
            throw new Error(`Standalone output must not contain symlinks: ${file.name}`);
        if (! file.isFile())
            continue;
        const path = join(file.parentPath, file.name);
        const target = resolve(destination, relative(source, path));
        if (! isWithin(destination, target))
            throw new Error("Standalone output escapes its mount.");
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target, constants.COPYFILE_EXCL);
    }
}

export async function siteFile(directory, pathname) {
    if (/[\\\u0000]/.test(pathname))
        return;
    const target = resolve(directory, `.${pathname}`);
    if (target !== resolve(directory) && ! isWithin(directory, target))
        return;
    for (const candidate of [join(target, "index.html"), target, `${target}.html`]) {
        if (! isWithin(directory, candidate))
            continue;
        try {
            if ((await stat(candidate)).isFile()) {
                return await resolveItemFile(directory, candidate);
            }
        }
        catch (error) {
            if (! ["ENOENT", "ENOTDIR"].includes(error.code ?? ""))
                throw error;
        }
    }
}
