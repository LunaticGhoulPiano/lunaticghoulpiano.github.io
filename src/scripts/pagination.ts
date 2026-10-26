import { formatMessage } from "../i18n/format.ts";
import { paginationState } from "../utils/pagination.ts";
import { formatSequenceNumber } from "../utils/numbering.ts";

interface Controller {
    setItems: (items: HTMLElement[]) => void;
}

const controllers = new WeakMap<HTMLElement, Controller>();

export function paginationFor(root: HTMLElement) {
    const existing = controllers.get(root);
    if (existing) return existing;
    const navigation = root.querySelector<HTMLElement>("[data-pagination]");
    let items = [...root.querySelectorAll<HTMLElement>("[data-page-item]")];
    if (! navigation) throw new Error("Pagination navigation is missing.");
    const pageSize = Number(navigation.dataset.pageSize);
    const buttons = [...navigation.querySelectorAll<HTMLButtonElement>("[data-page-control]")];
    const gaps = [...navigation.querySelectorAll<HTMLElement>("[data-page-gap]")];
    const status = navigation.querySelector<HTMLElement>("[data-page-status]");
    let filtered = items;

    const render = (requestedPage: number) => {
        const state = paginationState(filtered.length, pageSize, requestedPage);
        const visible = new Set(filtered.slice(state.start, state.end));
        for (const item of items) item.hidden = ! visible.has(item);
        navigation.hidden = state.totalPages === 0;
        const targets: Record<string, number | null> = {
            "first-page": state.page > 2 ? 1 : null,
            previous: state.previous,
            current: state.page,
            next: state.next,
            "last-page": state.page < state.totalPages - 1 ? state.totalPages : null,
        };
        for (const button of buttons) {
            const role = button.dataset.pageControl!;
            const target = targets[role];
            button.hidden = target === null;
            button.dataset.targetPage = String(target ?? "");
            const label = target === null ? "" : formatSequenceNumber(target, state.totalPages);
            button.textContent = label;
            button.setAttribute("aria-label", formatMessage(navigation.dataset.pageLabel!, {
                page: label,
            }, navigation.dataset.formatLocale!));
        }
        for (const gap of gaps) {
            gap.hidden = gap.dataset.pageGap === "before" ? state.page <= 3 : state.page >= state.totalPages - 2;
        }
        if (status) {
            status.textContent = formatMessage(navigation.dataset.statusLabel!, {
                page: formatSequenceNumber(state.page, state.totalPages),
                total: state.totalPages,
            }, navigation.dataset.formatLocale!);
        }
    };

    for (const button of buttons) {
        button.addEventListener("click", () => {
            render(Number(button.dataset.targetPage));
            navigation.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({
                preventScroll: true,
            });
        });
    }
    const controller = {
        setItems(next: HTMLElement[]) {
            items = [...root.querySelectorAll<HTMLElement>("[data-page-item]")];
            filtered = next;
            render(1);
        },
    };
    controllers.set(root, controller);
    render(1);
    return controller;
}

export function initializePagination() {
    document.querySelectorAll<HTMLElement>("[data-paginated-list]").forEach(paginationFor);
}
