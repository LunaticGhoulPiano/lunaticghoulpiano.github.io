import { cp, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { defaultLocale } from "../../src/config/locales.ts";
import { projectRoot } from "../../src/config/runtime.mjs";
import { astroArguments } from "../../scripts/astro/run.mjs";
import { validationEnvironment } from "../../scripts/github/environment.mjs";
import { spawnSync } from "node:child_process";

export async function copySiteFixture(root) {
    const excluded = [join(projectRoot, "src/data/generated"), join(projectRoot, "src/contents")];
    for (const directory of ["src", "scripts/astro", "scripts/content"]) {
        await cp(join(projectRoot, directory), join(root, directory), {
            recursive: true,
            filter: (source) => ! excluded.includes(source),
        });
    }
    for (const file of ["runtime.mjs", "temp_dir.mjs"]) {
        await cp(join(projectRoot, "scripts", file), join(root, "scripts", file));
    }
    await writeFile(join(root, "package.json"), '{"type":"module","private":true}');
}

export function buildSiteFixture(root, snapshotDirectory) {
    return spawnSync(process.execPath, astroArguments("build", "--root", root), {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 60_000,
        env: validationEnvironment(snapshotDirectory),
    });
}

export function configuration(id = "sample", entry = { type: "markdown", file: "./body.md", path: "/blog/sample/" }, overrides = {}) {
    return {
        schemaVersion: 1,
        id,
        kind: "article",
        category: "development",
        placements: ["blog"],
        locales: {
            [defaultLocale]: {
                title: "Fixture sample",
                description: "Isolated framework validation.",
                date: "2026-10-25",
                draft: false,
                entry,
            },
        },
        ...overrides,
    };
}

export async function writeItem(root, config = configuration(), files = { "body.md": "## Content\n\nFixture only." }, directory = config.id) {
    const target = join(root, "src", "contents", directory);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "configs.json"), JSON.stringify(config, null, 4));
    for (const [name, content] of Object.entries(files)) {
        await mkdir(dirname(join(target, name)), { recursive: true });
        await writeFile(join(target, name), content);
    }
    return target;
}
