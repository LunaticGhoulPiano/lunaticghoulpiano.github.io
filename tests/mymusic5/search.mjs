import test from "node:test";
import assert from "node:assert/strict";
import { installGlobals, textElement } from "../fixture.mjs";
import { initializeSheetSearch } from "../../src/scripts/mymusic5.ts";
import { mymusic5SearchText, mymusic5SheetAttributes } from "../../src/data/mymusic5/content.ts";
import { locales } from "../../src/config/locales.ts";
import { useMessages } from "../../src/i18n/ui.ts";

test("sheet metadata preserves translated display and shares all difficulty and instrument aliases", () => {
    const sheet = {
        title: "Title", metaSong: "Song", metaMusician: "Composer", metaMaker: "Arranger", description: "Notes",
        instruments: ["piano-88keys", "unknown-instrument"], level: 4, instrumentation: "solo", sheetType: "2staves",
        includeChord: true, includeLyrics: true,
    };
    const search = mymusic5SearchText(sheet);
    assert.match(search, /expert/);
    assert.match(search, /piano-88keys/);
    for (const locale of locales) {
        const copy = useMessages(locale).mymusic5;
        const expected = [copy.piano, "unknown-instrument", copy.expert, copy.solo, copy.twoStaves, copy.chords, copy.lyrics];
        assert.deepEqual(mymusic5SheetAttributes(sheet, locale), expected);
        for (const attribute of expected) assert.ok(search.includes(attribute));
        const sparse = { ...sheet, level: null, instrumentation: "unspecified", sheetType: null, includeChord: false, includeLyrics: false };
        assert.deepEqual(mymusic5SheetAttributes(sparse, locale), [copy.piano, "unknown-instrument"]);
        assert.equal(mymusic5SheetAttributes({ ...sparse, level: 99 }, locale).at(-1), "99");
    }
});

function fixture(context) {
    const rows = ["Prelude Piano Normal 普通", "Fugue 鋼琴 Expert 專家", "Waltz Description for experts cafe\u0301"]
        .map((text, index) => Object.assign(textElement(text), {
            dataset: { sheetId: String(index + 1), search: text },
            number: { textContent: String(index + 1) },
            querySelector() { return this.number; },
            hidden: false,
        }));
    const input = Object.assign(new EventTarget(), { value: "" });
    const controls = { hidden: true };
    const empty = { hidden: true };
    const viewport = { scrollTop: 400 };
    const timeline = Object.assign(new EventTarget(), { querySelector: () => viewport });
    let updates = 0;
    timeline.addEventListener("timeline:change", () => updates++);
    const nodes = {
        "[data-list-search]": input,
        "[data-list-search-controls]": controls,
        "[data-sheet-empty]": empty,
        "[data-timeline-window]": timeline,
    };
    const root = { dataset: {}, querySelector: (selector) => nodes[selector], querySelectorAll: () => rows };
    installGlobals(context, { document: { querySelectorAll: () => [root] } });
    initializeSheetSearch();
    initializeSheetSearch();
    return {
        rows, empty, controls, viewport,
        updates: () => updates,
        visible: () => rows.filter((row) => ! row.hidden).map((row) => row.dataset.sheetId),
        search(value) { input.value = value; input.dispatchEvent(new Event("input")); },
    };
}

test("sheet search matches difficulty or other keywords, combines terms and normalizes Unicode", (context) => {
    const view = fixture(context);
    assert.equal(view.controls.hidden, false);
    view.search("Expert");
    assert.deepEqual(view.visible(), ["2", "3"]);
    assert.deepEqual(view.rows[1].querySelectorAll("mark").map((mark) => mark.textContent), ["Expert"]);
    view.search("  eXPERT\t鋼琴\n");
    assert.deepEqual(view.visible(), ["2"]);
    assert.equal(view.rows[1].number.textContent, "1");
    view.search("專家");
    assert.deepEqual(view.visible(), ["2"]);
    assert.deepEqual(view.rows[1].querySelectorAll("mark").map((mark) => mark.textContent), ["專家"]);
    view.search("CAFÉ");
    assert.deepEqual(view.visible(), ["3"]);
});

test("sheet search keeps the same rows and timeline, handles empty results and restores all sheets", (context) => {
    const view = fixture(context);
    const originals = [...view.rows];
    assert.equal(view.updates(), 1);
    view.search("no-match");
    assert.deepEqual(view.visible(), []);
    assert.equal(view.empty.hidden, false);
    assert.equal(view.viewport.scrollTop, 0);
    view.search("");
    assert.deepEqual(view.visible(), ["1", "2", "3"]);
    assert.ok(view.rows.every((row) => row.querySelectorAll("mark").length === 0));
    assert.equal(view.empty.hidden, true);
    assert.equal(view.updates(), 3);
    assert.deepEqual(view.rows.map((row) => row.number.textContent), ["1", "2", "3"]);
    assert.ok(view.rows.every((row, index) => row === originals[index]));
});
