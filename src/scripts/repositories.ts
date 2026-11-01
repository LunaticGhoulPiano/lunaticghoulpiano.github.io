import { formatMessage } from "../i18n/format.ts";
import { paginationFor } from "./pagination.ts";
import { formatSequenceNumber } from "../utils/numbering.ts";
import { createListSearch } from "./list_search.ts";
import { createContentTransition } from "./motion.ts";

export function initializeRepositories() {
    document.querySelectorAll<HTMLElement>("[data-repository-browser]").forEach((browser) => {
        if (browser.dataset.repositoryReady) return;
        const input = browser.querySelector<HTMLInputElement>("[data-list-search]");
        const count = browser.querySelector<HTMLElement>("[data-repository-count]");
        const empty = browser.querySelector<HTMLElement>("[data-no-results]");
        const buttons = [...browser.querySelectorAll<HTMLButtonElement>("[data-repository-filter]")];
        const rows = [...browser.querySelectorAll<HTMLElement>("[data-repository]")];
        if (!input || !count || !empty) return;
        const pagination = paginationFor(browser);
        const countMessage = JSON.parse(count.dataset.label!);
        const transition = createContentTransition(browser.querySelector<HTMLElement>("[data-content-transition]")!);
        let selected = 0;
        function selection() {
            buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === selected)));
        }
        const filter = () => {
            const type = buttons[selected]?.dataset.repositoryFilter ?? "all";
            const matching = rows.filter((row) => (type === "all" || row.dataset.type === type) && search.matches(row));
            matching.forEach((row, index) => {
                row.querySelector<HTMLElement>("[data-repository-index]")!.textContent = formatSequenceNumber(index + 1, matching.length);
                search.highlight(row);
            });
            pagination.setItems(matching);
            count.textContent = formatMessage(countMessage, { count: matching.length }, browser.dataset.formatLocale!);
            empty.hidden = matching.length > 0;
            selection();
        };
        function filterImmediately() {
            transition.cancel();
            filter();
        }
        const search = createListSearch(browser, rows, filterImmediately);
        filter();
        buttons.forEach((button, index) => button.addEventListener("click", () => {
            if (index === selected) return;
            const direction = Math.sign(index - selected);
            selected = index;
            selection();
            transition.run(filter, direction);
        }));
        browser.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
            selected = 0;
            search.reset();
            input.focus();
        });
        browser.dataset.repositoryReady = "true";
    });
}
