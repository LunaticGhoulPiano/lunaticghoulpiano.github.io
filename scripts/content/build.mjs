import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { projectRoot } from "../../src/config/runtime.mjs";
import { isWithin, readContentConfigurations, resolveItemFile } from "./loader.mjs";

export function buildOptions(args = process.argv.slice(2)) {
    return parseArgs({ args, options: {
        item: { type: "string" }, locale: { type: "string" }, section: { type: "string" },
        force: { type: "boolean", default: false }, install: { type: "boolean", default: false },
    } }).values;
}

export function runCommand(command, cwd) {
    const [executable, ...args] = command;
    const result = spawnSync(executable === "node" ? process.execPath : executable, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Command failed (${result.status ?? result.signal}): ${executable}`);
}

async function readState(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError) return;
        throw error;
    }
}

async function fingerprint(paths, seed = "") {
    const hash = createHash("sha256").update(seed);
    async function visit(path, name) {
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error(`Build inputs and outputs must not contain symlinks: ${path}`);
        hash.update(name.replaceAll(sep, "/") + "\0");
        if (info.isDirectory()) {
            hash.update("directory\0");
            for (const child of (await readdir(path)).sort()) await visit(join(path, child), join(name, child));
        }
        else if (info.isFile()) {
            hash.update(await readFile(path)).update("\0");
        }
        else throw new Error(`Unsupported build file: ${path}`);
    }
    for (const [index, path] of paths.entries()) await visit(path, String(index));
    return hash.digest("hex");
}

async function outputFingerprint(path) {
    try {
        await resolveItemFile(path, "./index.html");
        return await fingerprint([path]);
    }
    catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
    }
}

async function managedPath(root, target) {
    if (! isWithin(root, target)) throw new Error(`Build path escapes its managed directory: ${target}`);
    const resolvedRoot = await realpath(root);
    let ancestor = target;
    while (true) {
        try {
            const resolved = await realpath(ancestor);
            if (resolved !== resolvedRoot && ! isWithin(resolvedRoot, resolved)) throw new Error(`Build path escapes through a symlink: ${target}`);
            return;
        }
        catch (error) {
            if (error.code !== "ENOENT") throw error;
            ancestor = dirname(ancestor);
        }
    }
}

async function removeDirectory(path, root) {
    await managedPath(root, path);
    await rm(path, { recursive: true, force: true });
}

async function replaceDirectory(source, target, root) {
    await managedPath(root, target);
    await mkdir(dirname(target), { recursive: true });
    const stage = await mkdtemp(join(dirname(target), `.${basename(target)}-`));
    const backup = join(stage, "previous");
    const next = join(stage, "next");
    let preserveBackup = false;
    try {
        await cp(source, next, { recursive: true });
        try {
            await rename(target, backup);
            preserveBackup = true;
        }
        catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        try {
            await rename(next, target);
            preserveBackup = false;
        }
        catch (error) {
            if (preserveBackup) {
                await rename(backup, target);
                preserveBackup = false;
            }
            throw error;
        }
    }
    finally {
        if (! preserveBackup) await removeDirectory(stage, root);
    }
}

/** @param {{ root?: string, item?: string, locale?: string, section?: string, force?: boolean, install?: boolean,
 * run?: (command: string[], cwd: string) => void | Promise<void>, log?: (message: string) => void }} options */
export async function buildContents({ root = projectRoot, item, locale, section, force = false, install = false, run = runCommand, log = console.log } = {}) {
    root = resolve(root);
    const configurations = await readContentConfigurations(root);
    if (item && ! configurations.some(({ config }) => config.id === item)) throw new Error(`Unknown content: ${item}`);
    if (section && ! configurations.some(({ config }) => config.placements.includes(section))) throw new Error(`No content in section: ${section}`);
    const selected = configurations.filter(({ config }) => (! item || config.id === item) && (! section || config.placements.includes(section)));
    if (locale && ! selected.some(({ config }) => config.locales[locale])) throw new Error(`No selected content for locale: ${locale}`);
    const cache = join(root, ".cache", "content-build");
    await managedPath(root, cache);
    await mkdir(cache, { recursive: true });
    const active = new Set(configurations.flatMap(({ config }) => Object.entries(config.locales)
        .filter(([, value]) => config.build && ! value.draft && value.entry.type === "site")
        .map(([language]) => `${config.id}/${language}`)));
    for (const directory of await readdir(cache, { withFileTypes: true })) {
        if (! directory.isDirectory() || directory.name.startsWith(".")) continue;
        for (const language of await readdir(join(cache, directory.name))) {
            if (! active.has(`${directory.name}/${language}`)) await removeDirectory(join(cache, directory.name, language), cache);
        }
    }
    const results = [];
    const tool = await readFile(new URL(import.meta.url), "utf8");
    for (const { directory, config } of selected) {
        if (! config.build) continue;
        let installed = false;
        const outputs = Object.values(config.locales).filter(({ entry }) => entry.type === "site").map(({ entry }) => resolve(directory, entry.root));
        if (outputs.some((path, index) => outputs.some((other, otherIndex) => index !== otherIndex && (path === other || isWithin(path, other))))) {
            throw new Error(`Build outputs overlap: ${config.id}`);
        }
        for (const [language, value] of Object.entries(config.locales)) {
            if (value.draft || value.entry.type !== "site" || (locale && locale !== language)) continue;
            const output = resolve(directory, value.entry.root);
            await managedPath(directory, output);
            const inputs = [join(directory, "configs.json")];
            for (const [base, paths] of [[directory, config.build.inputs], [root, config.build.sharedInputs]]) {
                for (const path of paths) {
                    const input = resolve(base, path.replaceAll("{locale}", language));
                    await managedPath(base, input);
                    if (outputs.some((target) => input === target || isWithin(target, input) || isWithin(input, target))) {
                        throw new Error(`Build input overlaps output: ${path}`);
                    }
                    inputs.push(input);
                }
            }
            const inputHash = await fingerprint(inputs, JSON.stringify([process.version, process.platform, process.arch, tool]));
            const saved = join(cache, config.id, language);
            await managedPath(cache, saved);
            const state = await readState(join(saved, "manifest.json"));
            const cachedOutput = join(saved, "output");
            if (! force && state?.inputHash === inputHash && typeof state.outputHash === "string" && state.outputHash === await outputFingerprint(cachedOutput)) {
                if (await outputFingerprint(output) !== state.outputHash) await replaceDirectory(cachedOutput, output, directory);
                log(`[Content] Reused ${config.id} (${language}).`);
                results.push({ id: config.id, locale: language, built: false });
                continue;
            }
            if (install && ! installed) {
                const pnpm = process.env.npm_execpath;
                if (! pnpm || ! basename(pnpm).startsWith("pnpm")) throw new Error("Use pnpm build --install to install content dependencies.");
                await run(["node", pnpm, "install", "--frozen-lockfile"], directory);
                installed = true;
            }
            const stage = await mkdtemp(join(cache, ".build-"));
            try {
                const outDir = join(stage, "output");
                const command = config.build.command.map((argument) => argument.replaceAll("{locale}", language).replaceAll("{outDir}", outDir));
                log(`[Content] Building ${config.id} (${language}).`);
                await run(command, directory);
                const outputHash = await outputFingerprint(outDir);
                if (! outputHash) throw new Error(`Content build did not produce index.html: ${config.id} (${language})`);
                if (inputHash !== await fingerprint(inputs, JSON.stringify([process.version, process.platform, process.arch, tool]))) {
                    throw new Error(`Content changed during build; rerun the build: ${config.id}`);
                }
                await writeFile(join(stage, "manifest.json"), JSON.stringify({ inputHash, outputHash }));
                await replaceDirectory(stage, saved, cache);
                await replaceDirectory(join(saved, "output"), output, directory);
                results.push({ id: config.id, locale: language, built: true });
            }
            finally {
                await removeDirectory(stage, cache);
            }
        }
    }
    return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await buildContents(buildOptions());
    }
    catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
