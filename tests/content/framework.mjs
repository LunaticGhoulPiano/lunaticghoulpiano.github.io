import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { createServer } from "node:net";
import { astroArguments } from "../../scripts/astro/run.mjs";
import { projectRoot } from "../../src/config/runtime.mjs";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { validationEnvironment } from "../../scripts/github/environment.mjs";
import { configuration, writeItem, copySiteFixture, buildSiteFixture } from "./fixture.mjs";
import { defaultLocale, locales, localizedPath } from "../../src/config/locales.ts";
import { tagPath } from "../../src/routing.ts";

async function styles(html, output) {
    const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => match[0])
        .filter((tag) => /\brel="stylesheet"/.test(tag))
        .map((tag) => tag.match(/\bhref="([^"]+)"/)[1]);
    return [...inline, ...await Promise.all(links.map((path) => readFile(join(output, path), "utf8")))].join("\n");
}

test("one item directory publishes Markdown, an interactive Astro page, a direct link and a mounted site", async () => {
    await withTemporaryDirectory(async (root) => {
        await copySiteFixture(root);
        const routeFile = join(root, "src/config/routes.ts");
        await writeFile(routeFile, (await readFile(routeFile, "utf8")).replace("cv: {", "cv: {\n        content: true,"));
        const mainStyles = join(root, "src/styles/global.css");
        await writeFile(mainStyles, (await readFile(mainStyles, "utf8")) + "\nbody { --fixture-main-style: 1; }\n");

        const article = configuration("fixture-article", { type: "markdown", file: "./body.md", path: "/notes/fixture-article/" }, {
            related: ["fixture-demo", "fixture-site", "fixture-external"],
            tags: ["framework", "C++", "鋼琴", "ピアノ"], placements: ["blog", "studying", "cv"],
        });
        await writeItem(root, article, {
            "body.md": "## Fixture heading\n\n![Local image](./image.svg)",
            "image.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
        });
        const demoConfig = configuration("fixture-demo", { type: "astro", file: "./Demo.astro", path: "/games/fixture-demo/" }, {
            kind: "game", placements: ["projects", "studying"], tags: ["framework"],
        });
        for (const locale of locales) demoConfig.locales[locale] = { ...demoConfig.locales[defaultLocale] };
        await writeItem(root, demoConfig, {
            "Demo.astro": `---
import "./style.css";
const { item, locale } = Astro.props;
---
<!doctype html>
<html lang={locale}>
    <head><title>{item.data.title}</title></head>
    <body>
        <button id="fixture-counter">0</button>
        <script>
            import { connect } from "./counter.ts";
            connect();
        </script>
    </body>
</html>`,
            "counter.ts": 'export function connect() { document.querySelector("#fixture-counter")?.addEventListener("click", (event) => { const button = event.currentTarget as HTMLButtonElement; button.textContent = String(Number(button.textContent) + 1); }); }',
            "style.css": "body { --fixture-demo-style: 1; background: rgb(10, 20, 30); } #fixture-counter { color: rgb(10, 20, 30); }",
        });
        await writeItem(root, configuration("fixture-other", { type: "astro", file: "./Other.astro", path: "/games/fixture-other/" }), {
            "Other.astro": `<!doctype html>
<html lang="en">
    <head><title>Other fixture page</title></head>
    <body><h1>Independent fixture styles</h1></body>
</html>
<style>
    body { --fixture-other-style: 1; background: rgb(30, 20, 10); }
</style>`,
        });
        await writeItem(root, configuration("fixture-external", { type: "link", url: "https://example.test/independent/" }, {
            kind: "documentation", placements: ["projects"],
        }), {});
        await writeItem(root, configuration("fixture-site", { type: "site", root: "./built", path: "/docs/fixture-site/" }, {
            kind: "documentation", placements: ["projects"], tags: ["framework"],
        }), {
            "built/index.html": '<!doctype html><title>Standalone fixture</title><script src="./app.js"></script><a href="./guide/">Guide</a>',
            "built/app.js": 'document.documentElement.dataset.fixture = "mounted";',
            "built/guide/index.html": "<h1>Independent guide</h1>",
        });
        const build = buildSiteFixture(root);
        assert.equal(build.status, 0, build.stdout + build.stderr);
        const output = join(root, "dist");
        const page = (path) => readFile(join(output, localizedPath(path, defaultLocale), "index.html"), "utf8");
        for (const path of ["/", "/blog/", "/projects/", "/feeds/", "/notes/fixture-article/", "/blog/tags/framework/"]) {
            const css = await styles(await page(path), output);
            assert.match(css, /--fixture-main-style/);
            assert.doesNotMatch(css, /--fixture-demo-style|--fixture-other-style/);
        }
        for (const locale of locales) {
            const html = await readFile(join(output, localizedPath("/games/fixture-demo/", locale), "index.html"), "utf8");
            const css = await styles(html, output);
            assert.match(css, /--fixture-demo-style/);
            assert.doesNotMatch(css, /--fixture-main-style|--fixture-other-style/);
            assert.ok(html.includes(`lang="${locale}"`));
        }
        const otherStyles = await styles(await page("/games/fixture-other/"), output);
        assert.match(otherStyles, /--fixture-other-style/);
        assert.doesNotMatch(otherStyles, /--fixture-main-style|--fixture-demo-style/);
        const articleHtml = await page("/notes/fixture-article/");
        assert.match(articleHtml, /id="fixture-heading"/);
        assert.ok(articleHtml.includes("Local image"), articleHtml.match(/class="prose"[\s\S]*?<\/div>/)?.[0]);
        assert.ok(! articleHtml.includes('src="./image.svg"'));
        const demo = await page("/games/fixture-demo/");
        assert.match(demo, /id="fixture-counter"/);
        assert.doesNotMatch(demo, /class="site-header"|class="prose"|post-meta/);
        assert.match(demo, /<script[^>]*type="module"/);
        const scripts = await readdir(join(output, "_astro"));
        const bundles = [demo, ...await Promise.all(scripts.filter((file) => file.endsWith(".js")).map((file) =>
            readFile(join(output, "_astro", file), "utf8")))];
        assert.ok(bundles.some((code) => code.includes("fixture-counter") && code.includes("click")));
        assert.match(await page("/docs/fixture-site/guide/"), /Independent guide/);
        assert.match(await readFile(join(output, "docs/fixture-site/app.js"), "utf8"), /mounted/);
        const projects = await page("/projects/");
        assert.ok(projects.includes('href="/games/fixture-demo/"'));
        assert.ok(projects.includes('href="https://example.test/independent/"'));
        assert.ok((await page("/profile/recent-studying/")).includes('href="/notes/fixture-article/"'));
        assert.ok((await page("/profile/cv/")).includes('href="/notes/fixture-article/"'));
        assert.ok((await page("/blog/tags/framework/")).includes('href="/games/fixture-demo/"'));
        const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
        assert.match(sitemap, /\/docs\/fixture-site\//);
        for (const locale of locales) assert.ok(sitemap.includes(localizedPath("/games/fixture-demo/", locale)));
        assert.doesNotMatch(sitemap, /example\.test\/independent/);

        const listener = createServer();
        await new Promise((accept) => listener.listen(0, "127.0.0.1", accept));
        const port = listener.address().port;
        await new Promise((accept) => listener.close(accept));
        const child = spawn(process.execPath, astroArguments("dev", "--root", root, "--port", String(port), "--host", "127.0.0.1"), {
            cwd: projectRoot, env: validationEnvironment(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
        });
        let logs = "";
        child.stdout.on("data", (data) => { logs = (logs + data).slice(-6000); });
        child.stderr.on("data", (data) => { logs = (logs + data).slice(-6000); });
        const closed = new Promise((accept) => child.once("exit", accept));
        async function until(path, accepts) {
            const deadline = Date.now() + 25_000;
            let lastResponse;
            while (Date.now() < deadline) {
                try {
                    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1500) });
                    const body = await response.text();
                    lastResponse = `${response.status}: ${body.slice(0, 500)}`;
                    if (accepts(response.status, body)) return body;
                }
                catch (error) {
                    lastResponse = `${error.message}: ${error.cause?.message ?? ""}`;
                }
                await setTimeout(150);
            }
            assert.fail(`Development request did not settle: ${path}\n${lastResponse}\n${logs}`);
        }
        try {
            await until("/games/fixture-demo/", (status, body) => status === 200 && body.includes("fixture-counter"));
            await until("/docs/fixture-site/guide/", (status, body) => status === 200 && body.includes("Independent guide"));
            await writeFile(join(root, "src/contents/fixture-article/body.md"), "## Updated Markdown fixture");
            await until("/notes/fixture-article/", (status, body) => status === 200 && body.includes("Updated Markdown fixture"));
            for (const tag of ["C++", "鋼琴", "ピアノ"]) {
                await until(tagPath(tag, defaultLocale), (status, body) => status === 200
                    && body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].trim() === tag);
            }
            article.tags.push("العربية");
            await writeItem(root, article, {});
            await until(tagPath("العربية", defaultLocale), (status, body) => status === 200 && body.includes("العربية"));
            article.tags = article.tags.filter((tag) => tag !== "ピアノ");
            await writeItem(root, article, {});
            await until(tagPath("ピアノ", defaultLocale), (status) => status === 404);
            const added = configuration("fixture-added", { type: "astro", file: "./Added.astro", path: "/games/fixture-added/" });
            const addedDirectory = join(root, "src/contents/fixture-added");
            await mkdir(addedDirectory, { recursive: true });
            await writeFile(join(addedDirectory, "Added.astro"), "<h1>New fixture entry</h1>");
            await writeItem(root, added, {});
            await until("/games/fixture-added/", (status, body) => status === 200 && body.includes("New fixture entry"));
            await writeFile(join(addedDirectory, "Added.astro"), "<h1>Updated fixture entry</h1>");
            await until("/games/fixture-added/", (status, body) => status === 200 && body.includes("Updated fixture entry"));
            added.locales[defaultLocale].entry.path = "/games/fixture-renamed/";
            await writeItem(root, added, {});
            await until("/games/fixture-renamed/", (status, body) => status === 200 && body.includes("Updated fixture entry"));
            await until("/games/fixture-added/", (status) => status === 404);
            added.locales[defaultLocale].draft = true;
            await writeItem(root, added, {});
            await until("/games/fixture-renamed/", (status) => status === 404);
            added.locales[defaultLocale].draft = false;
            await writeItem(root, added, {});
            await until("/games/fixture-renamed/", (status, body) => status === 200 && body.includes("Updated fixture entry"));
            await unlink(join(addedDirectory, "configs.json"));
            await until("/games/fixture-renamed/", (status) => status === 404);
        }
        finally {
            child.kill();
            await closed;
        }
    });
});
