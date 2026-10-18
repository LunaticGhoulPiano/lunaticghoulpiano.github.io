import test from "node:test";
import assert from "node:assert/strict";
import { feedSources, getFeedsPage } from "../../src/services/feeds/index.ts";
import { routes } from "../../src/config/routes.ts";
import { locales, languages } from "../../src/config/locales.ts";
import { messages } from "../../src/i18n/ui.ts";
import { formatMessage } from "../../src/i18n/format.ts";

test("an unimplemented feed has no snapshot or fabricated reporting period", () => {
    for (const locale of locales) {
        const detail = getFeedsPage("youtube", locale);
        assert.equal(detail.sources[0].data, null);
        assert.equal(detail.description, messages[locale].ui[routes.youtube.description]);
    }
});

test("feeds load all registered previews and only the selected detail source, including an additional source", (context) => {
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
        periodDescription: feedSources[keys[0]].periodDescription,
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
        assert.equal(overview.preview, true);
        assert.deepEqual(overview.sources.map((source) => source.key).sort(), [...keys, extra].sort());
        assert.deepEqual([...calls].sort(), [...keys, extra].sort());
        assert.equal(overview.description, messages[locale].ui[routes.feeds.description]);
        for (const key of [...keys, extra]) {
            calls.length = 0;
            const detail = getFeedsPage(key, locale);
            assert.equal(detail.preview, false);
            assert.deepEqual(calls, [key]);
            assert.deepEqual(detail.sources.map((source) => source.route), [key]);
            assert.equal(detail.description, formatMessage(messages[locale].ui[feedSources[key].periodDescription], {
                from: "2026 / 10 / 01",
                to: "2026 / 10 / 03",
            }, languages[locale].formatLocale));
        }
    }
});
