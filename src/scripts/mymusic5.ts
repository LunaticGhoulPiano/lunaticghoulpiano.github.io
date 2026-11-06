import { createListSearch } from "./list_search.ts";
import { formatSequenceNumber } from "../utils/numbering.ts";
import { paginationFor } from "./pagination.ts";
import { createContentTransition } from "./motion.ts";

export function initializeSheetSearch() {
    document.querySelectorAll<HTMLElement>("[data-sheet-browser]").forEach((root) => {
        if (root.dataset.ready) return;
        const rows = [...root.querySelectorAll<HTMLElement>("[data-sheet-id]")];
        const empty = root.querySelector<HTMLElement>("[data-sheet-empty]")!;
        const pagination = paginationFor(root);
        const transition = createContentTransition(root.querySelector<HTMLElement>("[data-content-transition]")!);
        const search = createListSearch(root, rows, () => transition.run(render, 0, "fade"));

        function render() {
            const matching = rows.filter(search.matches);
            matching.forEach((row, index) => {
                row.querySelector<HTMLElement>(".sheet-number")!.textContent = formatSequenceNumber(index + 1, matching.length);
                search.highlight(row);
            });
            pagination.setItems(matching);
            empty.hidden = matching.length > 0;
        }

        render();
        root.dataset.ready = "true";
    });
}
