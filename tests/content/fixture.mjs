import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { defaultLocale } from "../../src/config/locales.ts";

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
