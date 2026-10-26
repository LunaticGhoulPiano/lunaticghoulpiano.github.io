import test from "node:test";
import assert from "node:assert/strict";
import { highlightRanges, highlightMatches } from "../src/scripts/highlight.ts";
import { searchTerms } from "../src/data/search.ts";
import { themes } from "../src/config/theme.ts";
import { textElement } from "./fixture.mjs";

const matches = (text, terms) => highlightRanges(text, terms).map(([start, end]) => text.slice(start, end));

test("highlight matches literal substrings, repeated occurrences and overlapping terms", () => {
    assert.deepEqual(matches("GraphQL graphql", ["QL"]), ["QL", "ql"]);
    assert.deepEqual(matches("C++ [a.b]", ["C++", "[a.b]"]), ["C++", "[a.b]"]);
    assert.deepEqual(matches("banana", ["ana", "an"]), ["anana"]);
    assert.deepEqual(matches("Piano piano", ["PIANO", "piano", ""]), ["Piano", "piano"]);
    assert.deepEqual(matches("Piano", []), []);
    assert.deepEqual(matches("Piano", ["violin"]), []);
});

test("highlight retains original Unicode text and whole graphemes despite normalized offset changes", () => {
    assert.deepEqual(matches("cafe\u0301 CAFÉ", ["café"]), ["cafe\u0301", "CAFÉ"]);
    assert.deepEqual(matches("İstanbul Piano", ["piano"]), ["Piano"]);
    assert.deepEqual(matches("鋼琴とピアノ 🎹", ["鋼琴", "ピアノ", "🎹"]), ["鋼琴", "ピアノ", "🎹"]);
    assert.deepEqual(matches("👩🏽‍💻 developer", ["👩"]), ["👩🏽‍💻"]);
    assert.deepEqual(matches("ΟΣ", ["ος"]), ["ΟΣ"]);
});

test("shared highlighting preserves links, markup, handlers and literal HTML while clearing only its own marks", () => {
    const root = textElement();
    const document = root.ownerDocument;
    const link = document.createElement("a");
    link.href = "https://example.test/piano";
    link.textContent = "Piano <img src=x onerror=alert(1)>";
    const note = document.createElement("mark");
    note.textContent = "Author's annotation";
    const hidden = document.createElement("span");
    hidden.ariaHidden = "true";
    hidden.textContent = "Piano";
    root.append(link, note, hidden);
    let clicks = 0;
    link.addEventListener("click", () => clicks++);
    const original = root.textContent;
    const inactivePage = document.createElement("section");
    inactivePage.ariaHidden = "true";
    inactivePage.append(root);
    const run = (terms) => {
        highlightMatches(root, terms);
        assert.equal(root.textContent, original);
        assert.strictEqual(root.childNodes[1], link);
        assert.equal(link.href, "https://example.test/piano");
        assert.equal(hidden.childNodes.length, 1);
        return root.querySelectorAll("mark[data-search-highlight]").map((mark) => mark.textContent);
    };
    assert.deepEqual(run(["piano", "<img"]), ["Piano", "<img"]);
    assert.deepEqual(run(["PIANO"]), ["Piano"]);
    assert.deepEqual(run([]), []);
    assert.deepEqual(root.querySelectorAll("mark"), [note]);
    link.dispatchEvent(new Event("click"));
    assert.equal(clicks, 1);
});

test("global result highlighting follows the search tokenizer for technical and multilingual queries", () => {
    const row = textElement("MyMusic5API — GraphQL 鋼琴とピアノ C++");
    highlightMatches(row, searchTerms("Ql ピアノ C++"));
    assert.deepEqual(row.querySelectorAll("mark").map((mark) => mark.textContent), ["QL", "ピアノ", "C++"]);
});

function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map((part) => {
        const value = parseInt(part, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

test("every theme provides high contrast highlight text and a distinct background on each page surface", () => {
    for (const [name, theme] of Object.entries(themes)) {
        assert.ok(contrast(theme["highlight-text"], theme["highlight-background"]) >= 7, `${name} text`);
        for (const surface of ["background", "subtle", "field"]) {
            assert.ok(contrast(theme["highlight-background"], theme[surface]) >= 3, `${name} ${surface}`);
        }
    }
});
