import { carouselState } from "../utils/carousel.ts";
import { pageTurnDuration } from "../config/collections.ts";

export function initializePageTurners() {
    document.querySelectorAll<HTMLElement>("[data-page-turner]").forEach((root) => {
        if (root.dataset.ready) return;
        const region = root.querySelector<HTMLElement>("[data-page-turner-pages]")!;
        const pages = [...region.children] as HTMLElement[];
        const controls = root.querySelector<HTMLElement>("[data-page-turner-controls]")!;
        const previous = root.querySelector<HTMLButtonElement>("[data-page-turner-previous]")!;
        const next = root.querySelector<HTMLButtonElement>("[data-page-turner-next]")!;
        const position = root.querySelector<HTMLElement>("[data-page-turner-position]")!;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const interval = Number(root.dataset.interval);
        let state = carouselState(pages.length, 1, 0, true);
        let hovered = root.matches(":hover");
        let focused = root.contains(document.activeElement);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let animation: Animation | undefined;

        function schedule() {
            clearTimeout(timer);
            timer = undefined;
            const stopped = hovered || focused || document.hidden || reducedMotion.matches;
            root.dataset.paused = String(stopped);
            if (! stopped && ! animation && state.next !== null && Number.isFinite(interval) && interval > 0) {
                timer = setTimeout(() => move(1), interval);
            }
        }

        function render() {
            pages.forEach((page, index) => {
                const current = index === state.index;
                page.toggleAttribute("data-current", current);
                page.inert = ! current;
                page.setAttribute("aria-hidden", String(! current));
            });
            previous.disabled = state.previous === null;
            next.disabled = state.next === null;
            controls.hidden = state.next === null && state.previous === null;
            position.textContent = pages[state.index]?.getAttribute("aria-label") ?? "";
        }

        function move(direction: number, manual = false) {
            const target = direction < 0 ? state.previous : state.next;
            if (animation || target === null) return;
            clearTimeout(timer);
            const outgoing = pages[state.index];
            state = carouselState(pages.length, 1, target, true);
            position.setAttribute("aria-live", manual ? "polite" : "off");
            render();
            const turning = direction < 0 ? pages[state.index] : outgoing;
            if (! reducedMotion.matches && typeof turning.animate === "function") {
                turning.setAttribute("data-turning", "");
                const frames = [
                    { transform: "rotateY(0deg)", opacity: 1, boxShadow: "0 0 0 transparent" },
                    { transform: "rotateY(-105deg)", opacity: 0, boxShadow: "18px 0 32px #0000001a" },
                ];
                animation = turning.animate(direction < 0 ? frames.reverse() : frames, {
                    duration: pageTurnDuration,
                    easing: "ease-in-out",
                });
                animation.finished.catch(() => {}).then(() => {
                    turning.removeAttribute("data-turning");
                    animation = undefined;
                    schedule();
                });
            }
            schedule();
        }

        previous.addEventListener("click", () => move(-1, true));
        next.addEventListener("click", () => move(1, true));
        root.addEventListener("mouseenter", () => {
            hovered = true;
            schedule();
        });
        root.addEventListener("mouseleave", () => {
            hovered = false;
            schedule();
        });
        root.addEventListener("focusin", () => {
            focused = true;
            schedule();
        });
        root.addEventListener("focusout", (event) => {
            focused = root.contains(event.relatedTarget as Node | null);
            schedule();
        });
        document.addEventListener("visibilitychange", schedule);
        reducedMotion.addEventListener("change", schedule);
        root.dataset.ready = "true";
        render();
        schedule();
    });
}
