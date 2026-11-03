import { createMotion } from "./motion.ts";

/** Use layout coordinates, never the transformed item bounds. */
export function timelineItemPresentation(top: number, height: number, viewportHeight: number, arcWidth: number) {
    if (height <= 0 || viewportHeight <= 0) return { x: 0, scale: 1, opacity: 1 };
    const distance = Math.min(1, Math.abs((top + height / 2 - viewportHeight / 2) / (viewportHeight / 2)));
    const bend = distance * distance;
    const visible = Math.max(0, Math.min(top + height, viewportHeight) - Math.max(top, 0));
    const fraction = Math.min(1, visible / Math.min(height, viewportHeight));
    return {
        x: arcWidth * bend,
        scale: 1 - 0.2 * bend,
        opacity: fraction * fraction * (3 - 2 * fraction),
    };
}

export function initializeTimelines() {
    document.querySelectorAll<HTMLElement>("[data-timeline-window]").forEach((root) => {
        if (root.dataset.ready) return;
        const viewport = root.querySelector<HTMLElement>("[data-timeline-scroll]")!;
        const list = viewport.querySelector<HTMLOListElement>("ol")!;
        const newest = root.querySelector<HTMLButtonElement>("[data-timeline-newest]")!;
        const oldest = root.querySelector<HTMLButtonElement>("[data-timeline-oldest]")!;
        const visibleItems = Number(root.dataset.visibleItems);
        const fixedHeight = root.dataset.height;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const touchInput = window.matchMedia("(hover: none) and (pointer: coarse)");
        const motion = createMotion();
        let frame = 0;
        let arcWidth = 0;
        let visualFocus: HTMLElement | undefined;

        function select(item?: HTMLElement) {
            if (item === visualFocus) return;
            visualFocus?.toggleAttribute("data-visual-focus", false);
            item?.toggleAttribute("data-visual-focus", true);
            visualFocus = item;
        }

        function draw() {
            frame = 0;
            if (!viewport.clientWidth) {
                select();
                return;
            }
            const items = [...list.children] as HTMLElement[];
            const height = viewport.clientHeight;
            const top = list.offsetTop - viewport.scrollTop;
            // Read all layout before writing styles; transforms never affect sizing.
            const bounds = items.map((item) => ({ top: top + item.offsetTop, height: item.hidden ? 0 : item.offsetHeight }));
            const positions = bounds.map((item) => reducedMotion.matches
                ? { x: 0, scale: 1, opacity: 1 }
                : timelineItemPresentation(item.top, item.height, height, arcWidth));
            // Visual selection never changes DOM focus, tab order, or link activation.
            // Explicit keyboard focus takes precedence over automatic touch selection.
            let centered = -1;
            let closest = Infinity;
            if (touchInput.matches && !list.querySelector(":focus-visible")) {
                bounds.forEach((item, index) => {
                    if (item.height <= 0 || item.top >= height || item.top + item.height <= 0) return;
                    const distance = Math.abs(item.top + item.height / 2 - height / 2);
                    if (distance < closest) {
                        closest = distance;
                        centered = index;
                    }
                });
            }
            select(items[centered]);
            items.forEach((item, index) => {
                const position = positions[index];
                item.style.setProperty("--timeline-x", `${position.x.toFixed(2)}px`);
                item.style.setProperty("--timeline-scale", String(position.scale));
                item.style.setProperty("--timeline-opacity", String(position.opacity));
            });
        }

        function scheduleDraw() {
            if (!frame) frame = requestAnimationFrame(draw);
        }

        function sync() {
            const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            newest.disabled = viewport.scrollTop <= 1;
            oldest.disabled = viewport.scrollTop >= maximum - 1;
            newest.hidden = maximum <= 1;
            oldest.hidden = maximum <= 1;
            viewport.toggleAttribute("data-reveal-last", maximum > 1);
        }

        function resize() {
            if (viewport.clientWidth === 0) {
                scheduleDraw();
                return;
            }
            root.style.setProperty("--timeline-scrollbar-width", `${viewport.offsetWidth - viewport.clientWidth}px`);
            arcWidth = Math.min(56, viewport.clientWidth * 0.12);
            root.style.setProperty("--timeline-arc-width", `${arcWidth}px`);
            if (fixedHeight) {
                viewport.style.height = Number(fixedHeight) > 0 ? `${fixedHeight}px` : fixedHeight;
            }
            else {
                const items = [...list.children].filter((item) => ! (item as HTMLElement).hidden);
                if (items.length > 0) {
                    const lastVisible = items[Math.min(visibleItems, items.length) - 1] as HTMLElement;
                    const bottomPadding = Number.parseFloat(getComputedStyle(list).paddingBottom) || 0;
                    viewport.style.height = `${lastVisible.offsetTop + lastVisible.offsetHeight + bottomPadding}px`;
                }
            }
            sync();
            scheduleDraw();
        }

        function jump(oldestEntry: boolean) {
            const start = viewport.scrollTop;
            const end = oldestEntry ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : 0;
            motion.run((progress) => viewport.scrollTo({ top: start + (end - start) * progress, behavior: "instant" }));
        }

        newest.addEventListener("click", () => jump(false));
        oldest.addEventListener("click", () => jump(true));
        viewport.addEventListener("scroll", () => {
            sync();
            scheduleDraw();
        }, {
            passive: true,
        });
        root.addEventListener("timeline:change", () => { motion.cancel(); resize(); });
        for (const type of ["wheel", "touchstart", "pointerdown"]) {
            viewport.addEventListener(type, () => motion.cancel(), { passive: true });
        }
        viewport.addEventListener("keydown", (event) => {
            motion.cancel();
            if (event.target !== viewport || ! ["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            jump(event.key === "End");
        });
        viewport.addEventListener("focusin", scheduleDraw);
        viewport.addEventListener("focusout", scheduleDraw);
        reducedMotion.addEventListener("change", scheduleDraw);
        touchInput.addEventListener("change", scheduleDraw);
        const observer = new ResizeObserver(resize);
        observer.observe(list);
        observer.observe(viewport);
        root.dataset.ready = "true";
        resize();
    });
}
