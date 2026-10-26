import { highlightMatches } from "./highlight.ts";
import { normalizeSearchText, searchTerms } from "../data/search.ts";

export function createListSearch(root: HTMLElement, rows: HTMLElement[], update: () => void) {
    const input = root.querySelector<HTMLInputElement>("[data-list-search]")!;
    const texts = new Map(rows.map((row) => [row, normalizeSearchText(row.dataset.search ?? "")]));
    let terms: string[] = [];

    function read() {
        terms = searchTerms(input.value);
    }

    input.addEventListener("input", () => {
        read();
        update();
    });
    root.querySelector<HTMLElement>("[data-list-search-controls]")!.hidden = false;
    read();
    return {
        matches: (row: HTMLElement) => terms.every((term) => texts.get(row)!.includes(term)),
        highlight: (row: HTMLElement) => highlightMatches(row, terms),
        reset() {
            input.value = "";
            read();
            update();
        },
        get active() { return terms.length > 0; },
    };
}
