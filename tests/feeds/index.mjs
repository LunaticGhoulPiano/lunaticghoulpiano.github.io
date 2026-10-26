import test from "node:test";
import assert from "node:assert/strict";
import { feedSources, getFeedsPage } from "../../src/services/feeds/index.ts";
import { routes } from "../../src/config/routes.ts";
import { locales, languages } from "../../src/config/locales.ts";
import { messages } from "../../src/i18n/ui.ts";
import { formatMessage } from "../../src/i18n/format.ts";

test("media feeds use the same data in overview and detail pages", () => {
    for (const locale of locales) {
        for (const key of ["youtube", "mymusic5"]) {
            const detail = getFeedsPage(key, locale);
            const overview = getFeedsPage("feeds", locale).sources.find((source) => source.key === key);
            assert.deepEqual(detail.sources[0].data, overview.data);
            assert.ok(detail.sources[0].data);
            assert.equal(detail.description, messages[locale].ui[routes[key].description]);
        }
    }
});

test("feeds load all registered sources and only the selected detail source, including an additional source", (context) => {
    const keys = Object.keys(feedSources);
    assert.deepEqual(keys.sort(), Object.keys(routes).filter((route) => routes[route].section === "feeds" && route !== "feeds").sort());
    const calls = [];
    const period = {
        from: "2026-10-01T00:00:00Z",
        to: "2026-10-03T12:00:00Z",
    };
    for (const key of keys) context.mock.method(feedSources[key], "load", () => {
        calls.push(key);
        return {
            period,
        };
    });
    let extra = "fixture";
    while (Object.hasOwn(feedSources, extra) || Object.hasOwn(routes, extra)) extra += "_extra";
    feedSources[extra] = {
        title: "Fixture Source",
        route: extra,
        load: () => {
            calls.push(extra);
            return {
                period,
            };
        },
    };
    routes[extra] = {
        ...routes[keys[0]],
        path: `feeds/${extra}`,
    };
    context.after(() => {
        delete feedSources[extra];
        delete routes[extra];
    });

    for (const locale of locales) {
        calls.length = 0;
        const overview = getFeedsPage("feeds", locale);
        assert.deepEqual(overview.sources.map((source) => source.key).sort(), [...keys, extra].sort());
        assert.deepEqual([...calls].sort(), [...keys, extra].sort());
        assert.equal(overview.description, messages[locale].ui[routes.feeds.description]);
        for (const key of [...keys, extra]) {
            calls.length = 0;
            const detail = getFeedsPage(key, locale);
            assert.deepEqual(calls, [key]);
            assert.deepEqual(detail.sources.map((source) => source.route), [key]);
            assert.equal(detail.description, formatMessage(messages[locale].ui["description.activityPeriod"], {
                from: "2026 / 10 / 01",
                to: "2026 / 10 / 03",
            }, languages[locale].formatLocale));
        }
    }
});
