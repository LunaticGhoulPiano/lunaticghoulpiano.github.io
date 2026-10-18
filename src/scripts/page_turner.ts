import { carouselState } from "../utils/carousel.ts";
import { pageTurnDuration } from "../config/collections.ts";
import { createAutoAdvance } from "./auto_advance.ts";

export function initializePageTurners() {
    document.querySelectorAll<HTMLElement>("[data-page-turner]").forEach((root) => {
        if (root.dataset.ready) return;
        const region = root.querySelector<HTMLElement>("[data-page-turner-pages]")!;
        const pages = [...region.children] as HTMLElement[];
        const footers = [...root.querySelectorAll<HTMLElement>("[data-page-turner-footer]")];
        const controls = root.querySelector<HTMLElement>("[data-page-turner-controls]")!;
        const previous = root.querySelector<HTMLButtonElement>("[data-page-turner-previous]")!;
        const next = root.querySelector<HTMLButtonElement>("[data-page-turner-next]")!;
        const position = root.querySelector<HTMLElement>("[data-page-turner-position]")!;
        let state = carouselState(pages.length, 1, 0, true);
        let animation: Animation | undefined;
        const automatic = createAutoAdvance(root, {
            interval: Number(root.dataset.interval),
            advance: () => move(1),
            canAdvance: () => ! animation && state.next !== null,
        });

        function render() {
            pages.forEach((page, index) => {
                const current = index === state.index;
                page.toggleAttribute("data-current", current);
                page.inert = ! current;
                page.setAttribute("aria-hidden", String(! current));
                const footer = footers[index];
                if (footer) {
                    footer.toggleAttribute("data-current", current);
                    footer.inert = ! current;
                    footer.setAttribute("aria-hidden", String(! current));
                }
            });
            previous.disabled = state.previous === null;
            next.disabled = state.next === null;
            controls.hidden = state.next === null && state.previous === null;
            position.textContent = pages[state.index]?.getAttribute("aria-label") ?? "";
        }

        function move(direction: number, manual = false) {
            const target = direction < 0 ? state.previous : state.next;
            if (animation || target === null) return;
            automatic.cancel();
            const outgoing = pages[state.index];
            state = carouselState(pages.length, 1, target, true);
            position.setAttribute("aria-live", manual ? "polite" : "off");
            render();
            const turning = direction < 0 ? pages[state.index] : outgoing;
            if (! automatic.reducedMotion.matches && typeof turning.animate === "function") {
                turning.setAttribute("data-turning", "");
                const frames = [
                    { transform: "rotateY(0deg)", opacity: 1, boxShadow: "0 0 0 transparent" },
                    { transform: "rotateY(-105deg)", opacity: 0, boxShadow: "18px 0 32px #0000001a" },
                ];
                const currentAnimation = turning.animate(direction < 0 ? frames.reverse() : frames, {
                    duration: pageTurnDuration,
                    easing: "ease-in-out",
                });
                animation = currentAnimation;
                const completionTimer = setTimeout(finish, pageTurnDuration);
                function finish() {
                    if (animation !== currentAnimation) return;
                    clearTimeout(completionTimer);
                    turning.removeAttribute("data-turning");
                    animation = undefined;
                    currentAnimation.cancel();
                    automatic.schedule();
                }
                currentAnimation.finished.then(finish, finish);
            }
            automatic.schedule();
        }

        previous.addEventListener("click", () => move(-1, true));
        next.addEventListener("click", () => move(1, true));
        root.dataset.ready = "true";
        render();
        automatic.schedule();
    });
}
