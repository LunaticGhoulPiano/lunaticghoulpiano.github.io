import { constants } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { isWithin, resolveItemFile } from "./loader.mjs";

export async function prepareSite(root, item) {
    const { entry } = item.data;
    if (entry.type !== "site")
        throw new Error("Expected a standalone site.");
    const siteRoot = await resolveItemFile(join(root, item.data.directory), entry.root, "directory");
    return { directory: siteRoot };
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
