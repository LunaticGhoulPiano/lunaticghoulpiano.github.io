import test from "node:test";
import assert from "node:assert/strict";
import { installGlobals, textElement, paginationNavigation, contentTransitionFixture } from "../fixture.mjs";
import { initializeRepositories } from "../../src/scripts/repositories.ts";

function fixture(context, reduced = false) {
    const transition = contentTransitionFixture(reduced);
    const pagination = paginationNavigation();
    const rows = ["original", "fork", "original"].map((type, index) => Object.assign(textElement(`Repository ${index} piano`), {
        dataset: { type, search: `Repository ${index} piano` },
        number: {}, querySelector() { return this.number; },
    }));
    const buttons = ["all", "original", "fork"].map((type) => Object.assign(new EventTarget(), {
        dataset: { repositoryFilter: type }, setAttribute(name, value) { this[name] = value; },
    }));
    const input = Object.assign(new EventTarget(), { value: "", focus() {} });
    const count = { dataset: { label: JSON.stringify({ one: "{count} repository", other: "{count} repositories" }) } };
    const empty = {};
    const reset = new EventTarget();
    const nodes = {
        "[data-list-search]": input, "[data-repository-count]": count, "[data-no-results]": empty,
        "[data-content-transition]": transition.root, "[data-pagination]": pagination.navigation,
        "[data-list-search-controls]": {}, "[data-clear-filters]": reset,
    };
    const root = {
        dataset: { formatLocale: "en" }, querySelector: (selector) => nodes[selector],
        querySelectorAll: (selector) => selector === "[data-repository-filter]" ? buttons : rows,
    };
    installGlobals(context, { ...transition.environment, document: { querySelectorAll: () => [root] } });
    initializeRepositories();
    initializeRepositories();
    return {
        transition, rows, count, empty, reset, buttons,
        select: (index) => buttons[index].dispatchEvent(new Event("click")),
        visible: () => rows.filter((row) => !row.hidden),
        search(value) { input.value = value; input.dispatchEvent(new Event("input")); },
    };
}

test("repository filters use the shared transition and rapid selection keeps only the latest result", (context) => {
    const view = fixture(context);
    view.select(1);
    assert.equal(view.buttons[1]["aria-pressed"], "true");
    assert.equal(view.visible().length, 3);
    view.transition.frame(0);
    view.transition.frame(140);
    const before = view.transition.body.style.translate;
    view.select(2);
    assert.equal(view.transition.body.style.translate, before);
    view.transition.frame(150);
    view.transition.frame(710);
    assert.deepEqual(view.visible(), [view.rows[1]]);
    assert.equal(view.count.textContent, "1 repository");
    assert.equal(view.transition.pending(), 0);
});

test("repository search and reset cancel pending changes and preserve pagination and highlighting", (context) => {
    const view = fixture(context);
    view.select(2);
    view.search("piano");
    view.transition.frame(1000);
    assert.deepEqual(view.visible(), [view.rows[1]]);
    assert.equal(view.rows[1].querySelectorAll("mark")[0].textContent, "piano");
    view.search("no-match");
    assert.equal(view.empty.hidden, false);
    view.reset.dispatchEvent(new Event("click"));
    assert.equal(view.visible().length, 3);
    assert.equal(view.buttons[0]["aria-pressed"], "true");
    assert.equal(view.transition.pending(), 0);
});

test("reduced-motion repository filters switch immediately without scheduling animation", (context) => {
    const view = fixture(context, true);
    view.select(1);
    assert.deepEqual(view.visible(), [view.rows[0], view.rows[2]]);
    assert.equal(view.transition.pending(), 0);
    assert.equal(view.transition.body.inert, false);
});
