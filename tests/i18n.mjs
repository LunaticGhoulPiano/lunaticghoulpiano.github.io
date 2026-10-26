import test from "node:test";
import assert from "node:assert/strict";
import { formatMessage, countFormatter } from "../src/i18n/format.ts";
import { messages } from "../src/i18n/ui.ts";
import { languages, locales, defaultLocale, localizedPath } from "../src/config/locales.ts";

function messageParameters(message) {
    const variants = typeof message === "string" ? [message] : Object.values(message);
    return [...new Set(variants.flatMap((value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1])))].sort();
}

test("every translation preserves parameters and supplies the plural categories of its language", () => {
    for (const locale of locales) {
        const categories = new Intl.PluralRules(languages[locale].formatLocale).resolvedOptions().pluralCategories;
        for (const [group, entries] of Object.entries(messages[defaultLocale])) {
            for (const [key, reference] of Object.entries(entries)) {
                const translated = messages[locale][group][key];
                const expected = messageParameters(reference);
                assert.deepEqual(messageParameters(translated), expected, `${locale}.${group}.${key}`);
                if (typeof translated === "string") continue;
                for (const category of categories) {
                    assert.equal(typeof translated[category], "string", `${locale}.${group}.${key}.${category}`);
                    assert.deepEqual(messageParameters(translated[category]), expected);
                }
            }
        }
    }
});

test("interpolation handles repeated parameters, translated order, singular forms and missing arguments", () => {
    const locale = languages[defaultLocale].formatLocale;
    assert.equal(formatMessage("{value} then {value}", {
        value: "sample",
    }, locale), "sample then sample");
    assert.throws(() => formatMessage("{missing}", {}, locale), /Missing message parameter/);
    const message = {
        one: "{count} single",
        other: "{count} multiple",
    };
    for (const count of [0, 1, 2]) {
        const category = new Intl.PluralRules(locale).select(count);
        const expected = (message[category] ?? message.other).replace("{count}", new Intl.NumberFormat(locale).format(count));
        assert.equal(formatMessage(message, {
            count,
        }, locale), expected);
    }
});

test("all configured languages have complete dictionaries and consistent URL prefixes", () => {
    const groups = Object.keys(messages[defaultLocale]);
    for (const locale of locales) {
        assert.ok(languages[locale].shortName);
        assert.ok(languages[locale].formatLocale);
        for (const group of groups) {
            assert.deepEqual(
                Object.keys(messages[locale][group]).sort(),
                Object.keys(messages[defaultLocale][group]).sort(),
            );
        }
        const prefix = locale === defaultLocale ? "" : `/${locale}`;
        assert.equal(localizedPath("blog/example", locale), `${prefix}/blog/example/`);
        assert.equal(localizedPath("", locale), `${prefix}/`);
    }
});

test("counts preserve integer precision and distinguish hidden counts from zero", () => {
    const count = countFormatter("en-US");
    assert.equal(count("9007199254740993"), "9,007,199,254,740,993");
    assert.equal(count("0"), "0");
    assert.equal(count(null), "—");
    assert.equal(countFormatter("de-DE")("1234"), "1.234");
});
