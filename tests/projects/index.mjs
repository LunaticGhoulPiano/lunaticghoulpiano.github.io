import test from "node:test";
import assert from "node:assert/strict";
import { projectSources, getProjectsPage } from "../../src/services/projects/index.ts";
import { getFeedsPage } from "../../src/services/feeds/index.ts";
import { routes } from "../../src/config/routes.ts";
import { locales } from "../../src/config/locales.ts";

test("projects and feeds share YouTube and MyMusic5 content while GitHub projects remain repositories", () => {
    for (const locale of locales) {
        const projects = getProjectsPage("projects");
        const feeds = getFeedsPage("feeds", locale);
        for (const key of ["youtube", "mymusic5"]) {
            assert.deepEqual(projects.sources.find((source) => source.key === key).data,
                feeds.sources.find((source) => source.key === key).data);
        }
        assert.ok("repositories" in projects.sources.find((source) => source.key === "github").data);
        assert.ok("categories" in feeds.sources.find((source) => source.key === "github").data);
        assert.deepEqual(projects.sources.map((source) => source.route).sort(), Object.keys(routes)
            .filter((key) => routes[key].section === "projects" && key !== "projects").sort());
    }
});

test("projects select registered sources by route without assuming GitHub or a fixed source count", (context) => {
    const calls = [];
    for (const [key, source] of Object.entries(projectSources)) context.mock.method(source, "load", () => {
        calls.push(key);
        return { notice: null };
    });
    const extra = "fixture";
    projectSources[extra] = {
        title: "Fixture",
        route: "fixtureProjects",
        load: () => {
            calls.push(extra);
            return { notice: null };
        },
    };
    context.after(() => delete projectSources[extra]);
    const overview = getProjectsPage("projects");
    assert.deepEqual(overview.sources.map((source) => source.key), Object.keys(projectSources));
    assert.deepEqual(calls, Object.keys(projectSources));
    for (const [key, source] of Object.entries(projectSources)) {
        calls.length = 0;
        assert.deepEqual(getProjectsPage(source.route).sources.map((entry) => entry.key), [key]);
        assert.deepEqual(calls, [key]);
    }
});
