import { createMotion, onPageLeave } from "./motion.ts";

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
        type Row = { item: HTMLElement; top: number; height: number };
        let rows: Row[] = [];
        let previousVisible: Row[] = [];
        let refreshAll = true;

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
            const height = viewport.clientHeight;
            const start = viewport.scrollTop - list.offsetTop;
            // Rows are ordered and do not overlap. Locate the first visible row,
            // including on a jump from the first entry straight to the last.
            let first = 0;
            let end = rows.length;
            while (first < end) {
                const mid = Math.floor((first + end) / 2);
                if (rows[mid].top + rows[mid].height <= start) first = mid + 1;
                else end = mid;
            }
            let last = first;
            while (last < rows.length && rows[last].top < start + height) last++;
            const visible = rows.slice(first, last);
            let centered: HTMLElement | undefined;
            let closest = Infinity;
            if (touchInput.matches && !list.querySelector(":focus-visible")) {
                for (const row of visible) {
                    const distance = Math.abs(row.top + row.height / 2 - start - height / 2);
                    if (distance < closest) {
                        closest = distance;
                        centered = row.item;
                    }
                }
            }
            select(centered);
            if (refreshAll || !reducedMotion.matches) {
                const changed = refreshAll ? rows : new Set([...previousVisible, ...visible]);
                for (const { item, top, height: rowHeight } of changed) {
                    const position = reducedMotion.matches ? { x: 0, scale: 1, opacity: 1 }
                        : timelineItemPresentation(top - start, rowHeight, height, arcWidth);
                    item.style.setProperty("--timeline-x", `${position.x.toFixed(2)}px`);
                    item.style.setProperty("--timeline-scale", String(position.scale));
                    item.style.setProperty("--timeline-opacity", String(position.opacity));
                }
            }
            refreshAll = false;
            previousVisible = visible;
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
            rows = ([...list.children] as HTMLElement[]).filter(item => !item.hidden)
                .map(item => ({ item, top: item.offsetTop, height: item.offsetHeight }))
                .filter(row => row.height > 0).sort((a, b) => a.top - b.top);
            refreshAll = true;
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
        reducedMotion.addEventListener("change", resize);
        touchInput.addEventListener("change", scheduleDraw);
        const observer = new ResizeObserver(resize);
        observer.observe(list);
        observer.observe(viewport);
        onPageLeave(() => {
            motion.cancel(); cancelAnimationFrame(frame); observer.disconnect();
            reducedMotion.removeEventListener("change", resize);
            touchInput.removeEventListener("change", scheduleDraw);
        });
        root.dataset.ready = "true";
        resize();
    });
}
