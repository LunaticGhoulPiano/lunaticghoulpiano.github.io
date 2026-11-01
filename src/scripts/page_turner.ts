import { carouselState } from "../utils/carousel.ts";

export function initializePageTurners() {
    document.querySelectorAll<HTMLElement>("[data-page-turner]").forEach((root) => {
        if (root.dataset.ready) return;
        const region = root.querySelector<HTMLElement>("[data-page-turner-pages]")!;
        const pages = [...region.children] as HTMLElement[];
        const headings = [...root.querySelectorAll<HTMLElement>("[data-page-turner-heading]")];
        const controls = root.querySelector<HTMLElement>("[data-page-turner-controls]")!;
        const previous = root.querySelector<HTMLButtonElement>("[data-page-turner-previous]")!;
        const next = root.querySelector<HTMLButtonElement>("[data-page-turner-next]")!;
        const position = root.querySelector<HTMLElement>("[data-page-turner-position]")!;
        let state = carouselState(pages.length, 1, 0, true);
        function render() {
            pages.forEach((page, index) => {
                const current = index === state.index;
                page.toggleAttribute("data-current", current);
                page.inert = ! current;
                page.setAttribute("aria-hidden", String(! current));
                const heading = headings[index];
                if (heading) {
                    heading.toggleAttribute("data-current", current);
                    heading.inert = ! current;
                    heading.setAttribute("aria-hidden", String(! current));
                }
            });
            previous.disabled = state.previous === null;
            next.disabled = state.next === null;
            controls.hidden = state.next === null && state.previous === null;
            position.textContent = pages[state.index]?.getAttribute("aria-label") ?? "";
        }

        function move(direction: number) {
            const target = direction < 0 ? state.previous : state.next;
            if (target === null) return;
            state = carouselState(pages.length, 1, target, true);
            position.setAttribute("aria-live", "polite");
            render();
        }

        previous.addEventListener("click", () => move(-1));
        next.addEventListener("click", () => move(1));
        root.dataset.ready = "true";
        render();
    });
}
