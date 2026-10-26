import { normalizeSearchText } from "../data/search.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function highlightRanges(text: string, terms: readonly string[]): [number, number][] {
    const normalized = normalizeSearchText(text);
    const matches: [number, number][] = [];
    for (const term of new Set(terms.map(normalizeSearchText).filter(Boolean))) {
        let start = normalized.indexOf(term);
        while (start !== -1) {
            matches.push([start, start + term.length]);
            start = normalized.indexOf(term, start + 1);
        }
    }
    if (matches.length === 0) return [];

    // Map normalized offsets back to whole graphemes in the original text.
    const offsets: [number, number][] = [];
    for (const { segment, index } of graphemes.segment(text)) {
        for (let offset = 0; offset < normalizeSearchText(segment).length; offset++) {
            offsets.push([index, index + segment.length]);
        }
    }
    const ranges: [number, number][] = [];
    for (const [start, end] of matches.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        const range: [number, number] = [offsets[start][0], offsets[end - 1][1]];
        const previous = ranges.at(-1);
        if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
        else ranges.push(range);
    }
    return ranges;
}

export function highlightMatches(root: HTMLElement, terms: readonly string[]) {
    for (const mark of root.querySelectorAll<HTMLElement>("mark[data-search-highlight]")) {
        mark.replaceWith(...mark.childNodes);
    }
    root.normalize();
    if (! terms.some(Boolean)) return;

    const document = root.ownerDocument;
    const walker = document.createTreeWalker(root, 4);
    const texts: Text[] = [];
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const excluded = node.parentElement?.closest("script, style, textarea, select, [aria-hidden='true']");
        if (! excluded || ! root.contains(excluded)) texts.push(node);
    }
    for (const node of texts) {
        const ranges = highlightRanges(node.data, terms);
        if (ranges.length === 0) continue;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const [start, end] of ranges) {
            fragment.append(document.createTextNode(node.data.slice(offset, start)));
            const mark = document.createElement("mark");
            mark.dataset.searchHighlight = "";
            mark.textContent = node.data.slice(start, end);
            fragment.append(mark);
            offset = end;
        }
        fragment.append(document.createTextNode(node.data.slice(offset)));
        node.replaceWith(fragment);
    }
}
