import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { defaultLocale, locales } from "../../src/config/locales.ts";
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

export async function writeTaxonomyFixture(root) {
    const path = join(root, "src/config/routes.ts");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace("    projects: {", `    projectTags: {
        section: "projects",
        path: "projects/topics",
        title: "route.tags",
        description: "description.tags",
        taxonomy: { kind: "tag", placement: "projects" },
    },
    projectCategories: {
        section: "projects",
        path: "projects/categories",
        title: "route.categories",
        description: "description.categories",
        taxonomy: { kind: "category", placement: "projects" },
    },
    projects: {
        taxonomies: ["tag", "category"],`));
    for (const [id, title, placements, tags, category, draft] of [
        ["first", "Scoped first", ["projects", "blog"], ["C++", "shared"], "development", false],
        ["second", "Outside scope", ["blog"], ["C++", "blog-only"], "notes", false],
        ["third", "Scoped second", ["projects"], ["shared"], "music", false],
        ["draft", "Unpublished fixture", ["projects"], ["draft-only"], "unpublished", true],
    ]) {
        const config = configuration(id, { type: "link", url: `https://example.test/${id}/` }, { placements, tags, category });
        for (const locale of locales) config.locales[locale] = { ...config.locales[defaultLocale], title, draft };
        await writeItem(root, config, {});
    }
    await writeItem(root, configuration("taxonomy-host", { type: "astro", file: "./Page.astro", path: "/taxonomy-fixture/" }, { placements: [] }), {
        "Page.astro": `---
import BaseLayout from "../../layouts/BaseLayout.astro";
import TaxonomyIndex from "../../components/common/TaxonomyIndex.astro";
import { getContent } from "../../data/contents";
import { getTaxonomyIndex } from "../../data/taxonomy";
import { taxonomyPath } from "../../routing";
const { locale } = Astro.props;
const items = await getContent();
const index = (placement?: string) => getTaxonomyIndex(items, { kind: "tag", locale, placement })
    .map((entry) => ({ ...entry, href: taxonomyPath("tag", entry.value, locale, placement) }));
---
<BaseLayout title="Taxonomy component fixture" locale={locale} route="projects" pagePath="/taxonomy-fixture/">
    <aside data-fixture-aside>
        <h2>Scoped tags</h2>
        <TaxonomyIndex locale={locale} kind="tag" entries={index("projects")} />
    </aside>
    <section data-fixture-main>
        <h2>All tags</h2>
        <TaxonomyIndex locale={locale} kind="tag" entries={index()} />
    </section>
</BaseLayout>`,
    });
}
