import { astroArguments } from "../../scripts/astro/run.mjs";
import { githubPolicy } from "../../src/config/github.ts";
import { socialLinks } from "../../src/config/social.ts";
import { collectionPageSize, timelinePreviewSize } from "../../src/config/collections.ts";
import { formatMessage } from "../../src/i18n/format.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { projectRoot } from "../../src/config/runtime.mjs";
import { createTemporaryDirectory, removeTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { spawnSync } from "node:child_process";
import { validationEnvironment } from "../../scripts/github/environment.mjs";
import { GithubClient } from "../../scripts/github/client.ts";
import { fetchGithubSnapshots } from "../../scripts/github/fetch.ts";
import { fixtureFetch, fixtureLogin, fixtureNow } from "../github/fixture.mjs";
import { languages, locales, defaultLocale, localizedPath } from "../../src/config/locales.ts";
import { site } from "../../src/config/site.ts";
import { messages } from "../../src/i18n/ui.ts";
import { routes } from "../../src/config/routes.ts";

function decodeHtml(value) {
    const entities = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
    };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key) => {
        if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
        if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
        return entities[key] ?? entity;
    });
}

function text(html) {
    return decodeHtml(html.replace(/<[^>]+>/g, "")).trim();
}

function headings(html, level) {
    return [...html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "g"))]
        .map((match) => text(match[1]));
}

function attributes(tag) {
    return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)]
        .map((match) => [match[1], decodeHtml(match[2])]));
}

function links(html, relation) {
    return [...html.matchAll(/<link\b[^>]*>/g)]
        .map((match) => attributes(match[0]))
        .filter((link) => link.rel === relation);
}

function main(html) {
    const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
    assert.ok(match, "The page must contain its main content region.");
    return match[1];
}

async function addFixtureLocale(root) {
    let locale = "x-fixture";
    while (Object.hasOwn(languages, locale)) locale += "x";
    const language = {
        name: "Fixture Language",
        shortName: "FX",
        htmlLang: locale,
        formatLocale: languages[defaultLocale].formatLocale,
    };
    const dictionary = Object.fromEntries(Object.entries(messages[defaultLocale]).map(([group, entries]) => [
        group,
        Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, typeof value === "string" ? `[${locale}] & "${value}"` : Object.fromEntries(Object.entries(value).map(([category, text]) => [category, `[${locale}] & "${text}"`]))])),
    ]));
    const definitions = Object.fromEntries(locales.map((key) => [key, {
        ...languages[key],
        messages: messages[key],
    }]));
    definitions[locale] = {
        ...language,
        messages: dictionary,
    };
    await writeFile(join(root, "src/i18n/registry.ts"), `export const languageDefinitions = ${JSON.stringify(definitions, null, 4)} as const;\n`);
    return {
        locale,
        language,
        dictionary,
    };
}

function markdown(locale, pathSlug, translationKey, draft = false) {
    return `---
title: Fixture ${pathSlug}
slug: ${locale}/${pathSlug}
pathSlug: ${pathSlug}
locale: ${locale}
translationKey: ${translationKey}
description: Isolated route validation content.
date: "2026-10-01"
type: article
tags: [validation]
draft: ${draft}
---

## Validation heading

This test content must never appear in the real website build.
`;
}

test("isolated builds cover every configured language plus an additional locale, translations, drafts and duplicate rejection", async (context) => {
    const fixtureRoot = await createTemporaryDirectory("content_validation_");
    try {
        const fixtureDirectories = new Set(["blog", "projects", "studying"]
            .map((name) => resolve(projectRoot, "src/content", name)));
        fixtureDirectories.add(resolve(projectRoot, "src/data/generated"));
        await cp(resolve(projectRoot, "src"), join(fixtureRoot, "src"), {
            recursive: true,
            filter: (source) => ! fixtureDirectories.has(source),
        });
        await cp(resolve(projectRoot, "scripts/astro"), join(fixtureRoot, "scripts/astro"), {
            recursive: true,
        });
        await cp(resolve(projectRoot, "scripts/runtime.mjs"), join(fixtureRoot, "scripts/runtime.mjs"));
        const extra = await addFixtureLocale(fixtureRoot);
        const testLocales = [...locales, extra.locale];
        const testLanguages = {
            ...languages,
            [extra.locale]: extra.language,
        };
        const testMessages = {
            ...messages,
            [extra.locale]: extra.dictionary,
        };
        context.mock.method(globalThis, "fetch", fixtureFetch());
        const github = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, {}, fixtureNow);
        assert.deepEqual(github.failures, []);
        const generated = join(fixtureRoot, "src/data/generated");
        await mkdir(generated, {
            recursive: true,
        });

        const mixedActivity = {
            ...github.snapshots.activity,
            data: [
                ["WatchEvent", "2026-10-04T12:00:00Z"],
                ["PushEvent", "2026-10-03T12:00:00Z"],
                ["PullRequestEvent", "2026-10-02T12:00:00Z"],
                ["IssuesEvent", "2026-10-01T12:00:00Z"],
                ["ReleaseEvent", "2026-09-30T12:00:00Z"],
            ].map(([type, occurredAt], index) => ({
                id: String(index),
                type,
                occurredAt,
                repository: "another_owner/public_project",
                url: "https://github.com/another_owner/public_project",
            })),
        };
        await writeFile(join(generated, githubPolicy.snapshotFilename), JSON.stringify({
            ...github.snapshots,
            activity: mixedActivity,
        }), "utf8");
        await writeFile(
            join(fixtureRoot, "package.json"),
            JSON.stringify({
                private: true,
                type: "module",
            }),
            "utf8",
        );
        const blog = join(fixtureRoot, "src/content/blog");
        await mkdir(blog, {
            recursive: true,
        });
        const pairedSlugs = new Map();
        const standaloneSlugs = new Map();
        for (const [index, locale] of testLocales.entries()) {
            const paired = `fixture-published-${index}`;
            const standalone = `fixture-alone-${index}`;
            pairedSlugs.set(locale, paired);
            standaloneSlugs.set(locale, standalone);
            await writeFile(join(blog, `published_${index}.md`), markdown(locale, paired, "fixture-paired"), "utf8");
            await writeFile(join(blog, `standalone_${index}.md`), markdown(locale, standalone, standalone), "utf8");
            await writeFile(join(blog, `draft_${index}.md`), markdown(locale, `fixture-secret-draft-${index}`, "fixture-draft", true), "utf8");
        }

        function build(snapshotDirectory) {
            return spawnSync(process.execPath, astroArguments("build", "--root", fixtureRoot), {
                cwd: projectRoot,
                encoding: "utf8",
                timeout: 60_000,
                env: {
                    ...validationEnvironment(snapshotDirectory),
                },
            });
        }

        const first = build();
        assert.equal(first.status, 0, first.stdout + first.stderr);
        const output = join(fixtureRoot, "dist");
        const page = (path, locale) => readFile(join(output, localizedPath(path, locale).slice(1), "index.html"), "utf8");
        const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
        for (const locale of testLocales) {
            const copy = testMessages[locale];
            const landing = await page("", locale);
            assert.match(landing, /http-equiv="refresh"/);
            assert.ok(landing.includes(`url=${localizedPath("profile", locale)}`));
            const profile = await page("profile", locale);
            assert.deepEqual(headings(main(profile), 1), [site.name]);
            assert.equal(text(profile.match(/<p class="name-alias">([\s\S]*?)<\/p>/)[1]), site.secondaryName);
            assert.doesNotMatch(profile, /home-intro/);
            const overview = await page("feeds", locale);
            const feed = await page("feeds/github", locale);
            assert.deepEqual(headings(main(overview), 1), [copy.ui["route.feeds"]]);
            assert.deepEqual(headings(main(feed), 1), [copy.ui["route.github"]]);
            assert.deepEqual(headings(main(overview), 2), ["GitHub"]);
            assert.deepEqual(headings(main(feed), 2), []);
            const description = feed.match(/<p class="page-description">([\s\S]*?)<\/p>/)[1];
            assert.equal(text(description), copy.ui["description.githubPeriod"]
                .replace("{from}", "2026 / 09 / 17")
                .replace("{to}", "2026 / 10 / 17"));
            for (const category of feed.matchAll(/<section[^>]*data-activity-category="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
                assert.equal(typeof copy.activity[category[1]], "string");
                assert.deepEqual(headings(category[2], 3), [copy.activity[category[1]]]);
            }
            const commitBlock = feed.match(/data-activity-category="commit"[\s\S]*?<\/section>/)[0];
            assert.match(commitBlock, /class="activity-count">7<\/span>/);
            assert.doesNotMatch(commitBlock, /data-private-contributions/);
            const privateBlock = feed.match(/data-activity-category="private_repo_contribution"[\s\S]*?<\/section>/)[0];
            assert.match(privateBlock, /class="activity-count">82<\/span>/);
            const privateEntries = [...privateBlock.matchAll(/<li data-private-contributions[^>]*>[\s\S]*?<\/li>/g)].map((match) => match[0]);
            assert.equal(privateEntries.length, 2);
            assert.ok(text(privateEntries[0]).includes(formatMessage(copy.activity.privateCount, { count: 80 }, testLanguages[locale].formatLocale)));
            assert.match(privateEntries[0], /datetime="2026-10-03"/);
            assert.match(privateEntries[1], /datetime="2026-10-01"/);
            for (const entry of privateEntries) {
                assert.ok(text(entry).includes(copy.activity.privateRepository));
                assert.doesNotMatch(entry, /<a\b|2026-09-17/);
            }
            assert.equal([...feed.matchAll(/data-private-contributions/g)].length, 4);
            assert.equal([...overview.matchAll(/data-private-contributions/g)].length, 2);
            for (const html of [overview, feed]) {
                assert.doesNotMatch(html, /private_project|hidden_issue|fixture_only/);
                assert.doesNotMatch(html, /contribution-stats|contribution-calendar|github-summary|account-snapshot|data-timeline-toggle/);
                assert.equal([...html.matchAll(/class="content-section github-activity"/g)].length, 1);
                const notice = html.match(/<div class="snapshot-notice">([\s\S]*?)<\/div>/)[1];
                assert.ok(text(notice).startsWith(`${copy.content.snapshot}:`));
                assert.ok(html.includes(`data-timeline-window data-visible-items="${timelinePreviewSize}"`));
                const newest = html.match(/<button\b[^>]*data-timeline-newest[^>]*>/)[0];
                const oldest = html.match(/<button\b[^>]*data-timeline-oldest[^>]*>/)[0];
                assert.equal(attributes(newest)["aria-label"], copy.timeline.newest);
                assert.equal(attributes(oldest)["aria-label"], copy.timeline.oldest);
            }
            assert.match(feed, /another_owner\/public_project/);
            assert.doesNotMatch(feed, /feed-repositories|class="repository-list"|page-location/);
            assert.match(feed, /data-activity-category/);
            assert.match(feed, /data-activity-category="all"/);
            assert.match(feed, /data-carousel data-loop="true"/);
            assert.ok(feed.indexOf('data-carousel-track') < feed.indexOf('data-carousel-controls'));
            assert.match(feed, /data-carousel-scrollbar/);
            assert.match(overview, /class="activity-list/);
            const previewTimeline = overview.match(/<ol class="activity-list">([\s\S]*?)<\/ol>/)[1];
            assert.deepEqual([...previewTimeline.matchAll(/<time datetime="([^"]+)"/g)].map((match) => match[1]), [
                "2026-10-04T12:00:00.000Z",
                "2026-10-03T12:00:00.000Z",
                "2026-10-03",
                "2026-10-02T12:00:00.000Z",
                "2026-10-02",
                "2026-10-01T12:00:00.000Z",
                "2026-10-01",
                "2026-10-01",
                "2026-09-30T12:00:00.000Z",
            ]);
            const projects = await page("projects", locale);
            const blogPage = await page("blog", locale);
            assert.deepEqual(headings(main(projects), 1), [copy.ui["route.projects"]]);
            assert.deepEqual(headings(main(blogPage), 1), [copy.ui["route.blog"]]);
            for (const [route, definition] of Object.entries(routes)) {
                const { path, section } = definition;
                const html = await page(path, locale);
                assert.deepEqual(headings(main(html), 1), [route === "profile" ? site.name : copy.ui[definition.title]]);
                const navigation = html.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
                const active = [...navigation.matchAll(/<a\b[^>]*>/g)]
                    .map((match) => attributes(match[0]))
                    .filter((link) => link.class?.split(/\s+/).includes("is-active"));
                assert.deepEqual(active.map((link) => link.href), [localizedPath(routes[section].path, locale)]);
                assert.equal(html.includes('class="profile-layout"'), section === "profile");
                assert.doesNotMatch(html, /page-location/);
                assert.equal(attributes(html.match(/<html\b[^>]*>/)[0]).lang, testLanguages[locale].htmlLang);
                assert.deepEqual(links(html, "canonical").map((link) => link.href), [new URL(localizedPath(path, locale), site.url).href]);
                for (const language of testLocales) {
                    assert.ok(links(html, "alternate").some((link) =>
                        link.hreflang === testLanguages[language].htmlLang
                        && link.href === new URL(localizedPath(path, language), site.url).href));
                }
                for (const social of html.matchAll(/<ul class="social-links">([\s\S]*?)<\/ul>/g)) {
                    assert.doesNotMatch(social[1], /<a[^>]*>\s*<svg/);
                    const urls = [...social[1].matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);
                    assert.deepEqual(urls, socialLinks.map((link) => link.url));
                }
            }
            for (const html of [projects, blogPage]) assert.ok(html.includes(`data-pagination data-page-size="${collectionPageSize}"`));

            const paired = await page(`blog/${pairedSlugs.get(locale)}`, locale);
            assert.match(paired, /id="validation-heading"/);
            assert.ok(text(main(paired)).includes(copy.content.allPosts));
            const alternates = links(paired, "alternate");
            assert.equal(alternates.length, testLocales.length + 1);
            for (const language of testLocales) {
                const path = localizedPath(`blog/${pairedSlugs.get(language)}`, language);
                assert.ok(alternates.some((link) => link.hreflang === testLanguages[language].htmlLang && link.href === new URL(path, site.url).href));
                assert.ok(sitemap.includes(`<loc>${new URL(path, site.url).href}</loc>`));
            }
            const defaultPost = localizedPath(`blog/${pairedSlugs.get(defaultLocale)}`, defaultLocale);
            assert.ok(alternates.some((link) => link.hreflang === "x-default" && link.href === new URL(defaultPost, site.url).href));

            const standalonePath = `blog/${standaloneSlugs.get(locale)}`;
            const alone = await page(standalonePath, locale);
            assert.deepEqual(links(alone, "alternate").map((link) => link.hreflang).sort(),
                [testLanguages[locale].htmlLang, ...(locale === defaultLocale ? ["x-default"] : [])].sort());
            const switcher = alone.match(/<nav class="language-switcher"[^>]*>([\s\S]*?)<\/nav>/)[1];
            assert.equal([...switcher.matchAll(/aria-disabled="true"/g)].length, testLocales.length - 1);
            assert.equal([...switcher.matchAll(/aria-current="page"/g)].length, 1);
            assert.doesNotMatch(switcher, /<a\b/);
            assert.ok(sitemap.includes(`<loc>${new URL(localizedPath(standalonePath, locale), site.url).href}</loc>`));
            assert.equal(sitemap.includes(`<loc>${new URL(localizedPath("", locale), site.url).href}</loc>`), false);

            const tag = await page("blog/tags/validation", locale);
            for (const html of [tag, blogPage]) {
                assert.deepEqual(headings(main(html), 2).sort(), [
                    `Fixture ${pairedSlugs.get(locale)}`,
                    `Fixture ${standaloneSlugs.get(locale)}`,
                ].sort());
            }
        }
        const files = await readdir(output, {
            recursive: true,
        });
        assert.equal(
            files.some((file) => file.includes("fixture-secret-draft")),
            false,
        );
        for (const file of files.filter((file) => /\.(html|xml|js)$/.test(file))) {
            assert.doesNotMatch(await readFile(join(output, file), "utf8"), /fixture-secret-draft/);
        }

        const staged = join(fixtureRoot, "staged_snapshots");
        await mkdir(staged);
        const stagedBundle = JSON.parse(await readFile(join(generated, githubPolicy.snapshotFilename), "utf8"));
        stagedBundle.activity.data[0].repository = "staged_owner/staged_project";
        stagedBundle.activity.data[0].url = "https://github.com/staged_owner/staged_project";
        await writeFile(join(staged, githubPolicy.snapshotFilename), JSON.stringify(stagedBundle), "utf8");
        const stagedBuild = build(staged);
        assert.equal(stagedBuild.status, 0, stagedBuild.stdout + stagedBuild.stderr);
        for (const locale of testLocales) {
            assert.match(await page("feeds/github", locale), /staged_owner\/staged_project/);
        }

        await writeFile(
            join(blog, "duplicate.md"),
            markdown(defaultLocale, pairedSlugs.get(defaultLocale), "fixture-paired"),
            "utf8",
        );
        const duplicate = build();
        assert.notEqual(duplicate.status, 0, "Duplicate IDs must stop the build.");
        assert.match(duplicate.stdout + duplicate.stderr, /duplicate/i);
    } finally {
        await removeTemporaryDirectory(fixtureRoot);
    }
});
