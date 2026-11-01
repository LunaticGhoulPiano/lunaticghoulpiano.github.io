import { carouselState } from "../utils/carousel.ts";
import { createMotion } from "./motion.ts";

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
        let offset = 0;
        let destination = 0;
        const motion = createMotion();
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
            const start = offset;
            destination += direction;
            const end = destination;
            state = carouselState(pages.length, 1, target, true);
            position.setAttribute("aria-live", "polite");
            render();
            motion.run((progress) => {
                offset = start + (end - start) * progress;
                const first = Math.floor(offset);
                const firstIndex = carouselState(pages.length, 1, first, true).index;
                region.toggleAttribute("data-sliding", true);
                // Recycle a page only after it has left the viewport. Retargeting
                // keeps the same continuous offset, including reversals and wraps.
                pages.forEach((page, index) => {
                    const distance = (index - firstIndex + pages.length) % pages.length + first - offset;
                    page.style.translate = `${distance * 100}% 0`;
                    page.toggleAttribute("data-leaving", index !== state.index && distance > -1 && distance < 1);
                });
            }, () => {
                pages.forEach((page) => {
                    page.style.removeProperty("translate");
                    page.removeAttribute("data-leaving");
                });
                region.removeAttribute("data-sliding");
            });
        }

        previous.addEventListener("click", () => move(-1));
        next.addEventListener("click", () => move(1));
        root.dataset.ready = "true";
        render();
    });
}
