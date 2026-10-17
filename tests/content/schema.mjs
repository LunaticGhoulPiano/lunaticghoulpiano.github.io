import test from "node:test";
import assert from "node:assert/strict";
import { blogSchema, projectSchema, studyingSchema, published, validateContent } from "../../src/content/schema.ts";
import { locales } from "../../src/config/locales.ts";

for (const testLocale of locales) {
    test(`${testLocale}: collection schemas share identity and date rules without sharing Blog-only reserved paths`, () => {
        const data = {
            title: "Validation fixture",
            description: "Only used by tests.",
            locale: testLocale,
            slug: `${testLocale}/tags`,
            pathSlug: "tags",
            translationKey: "tags",
            date: "2026-10-01",
        };
        for (const [schema, fields] of [
            [blogSchema, {
                type: "note",
            }],
            [projectSchema, {
                status: "active",
            }],
            [studyingSchema, {
                status: "planned",
            }],
        ]) {
            assert.equal(schema.safeParse({
                ...data,
                ...fields,
            }).success, schema !== blogSchema);
            const valid = {
                ...data,
                ...fields,
                slug: `${testLocale}/sample`,
                pathSlug: "sample",
            };
            assert.ok(schema.safeParse({
                ...valid,
                updated: data.date,
            }).success);
            assert.ok(schema.safeParse({
                ...valid,
                updated: "2026-10-02",
            }).success);
            assert.equal(schema.safeParse({
                ...valid,
                updated: "2026-09-30",
            }).success, false);
            assert.equal(schema.safeParse({
                ...valid,
                slug: `${testLocale}/other`,
            }).success, false);
        }
    });

    function entry(slug = `${testLocale}/first`, overrides = {}) {
        const [locale, pathSlug] = slug.split("/");
        return {
            id: slug,
            data: blogSchema.parse({
                title: "Validation fixture",
                slug,
                pathSlug,
                locale,
                translationKey: pathSlug,
                description: "Only used by tests.",
                date: "2026-10-01",
                type: "note",
                ...overrides,
            }),
        };
    }

    test(`${testLocale}: drafts default to hidden and never enter the published query`, () => {
        const draft = entry(`${testLocale}/draft`);
        const first = entry(`${testLocale}/first`, {
            draft: false,
        });
        const second = entry(`${testLocale}/second`, {
            draft: false,
            date: "2026-10-02",
        });
        assert.deepEqual(
            published([draft, first, second]).map((post) => post.id),
            [`${testLocale}/second`, `${testLocale}/first`],
        );
    });

    test(`${testLocale}: stable IDs, reserved routes, real calendar dates and updated dates are validated`, () => {
        assert.throws(() => entry(`${testLocale}/tags`));
        assert.throws(() =>
            entry(`${testLocale}/first`, {
                pathSlug: "other",
            }),
        );
        assert.throws(() =>
            entry(`${testLocale}/first`, {
                date: "2026-02-30",
            }),
        );
        assert.throws(() =>
            entry(`${testLocale}/first`, {
                updated: "2026-09-01",
            }),
        );
        const original = entry();
        const renamed = entry(`${testLocale}/first`, {
            title: "Changed title",
        });
        assert.equal(original.id, renamed.id);
    });

    test(`${testLocale}: duplicate content IDs and translations are rejected`, () => {
        assert.throws(() => validateContent([entry(), entry()]), /duplicate content ID/);
        assert.throws(
            () =>
                validateContent([
                    entry(),
                    entry(`${testLocale}/second`, {
                        translationKey: "first",
                    }),
                ]),
            /Duplicate translation/,
        );
        assert.doesNotThrow(() => validateContent(locales.map((locale) => entry(`${locale}/first`))));
    });

    test(`${testLocale}: missing references and published links to draft posts are rejected`, () => {
        assert.throws(
            () =>
                validateContent([
                    entry(`${testLocale}/first`, {
                        relatedPosts: [`${testLocale}/missing`],
                    }),
                ]),
            /Invalid content reference/,
        );
        assert.throws(
            () =>
                validateContent([
                    entry(`${testLocale}/first`, {
                        draft: false,
                        relatedPosts: [`${testLocale}/second`],
                    }),
                    entry(`${testLocale}/second`),
                ]),
            /Invalid content reference/,
        );
    });

}
