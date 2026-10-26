import { createListSearch } from "./list_search.ts";
import { formatSequenceNumber } from "../utils/numbering.ts";

export function initializeSheetSearch() {
    document.querySelectorAll<HTMLElement>("[data-sheet-browser]").forEach((root) => {
        if (root.dataset.ready) return;
        const rows = [...root.querySelectorAll<HTMLElement>("[data-sheet-id]")];
        const empty = root.querySelector<HTMLElement>("[data-sheet-empty]")!;
        const timeline = root.querySelector<HTMLElement>("[data-timeline-window]")!;
        const viewport = timeline.querySelector<HTMLElement>("[data-timeline-scroll]")!;
        const search = createListSearch(root, rows, render);

        function render() {
            const matching = rows.filter(search.matches);
            for (const row of rows) row.hidden = true;
            matching.forEach((row, index) => {
                row.hidden = false;
                row.querySelector<HTMLElement>(".sheet-number")!.textContent = formatSequenceNumber(index + 1, matching.length);
                search.highlight(row);
            });
            empty.hidden = matching.length > 0;
            viewport.scrollTop = 0;
            timeline.dispatchEvent(new Event("timeline:change"));
        }

        render();
        root.dataset.ready = "true";
    });
}
