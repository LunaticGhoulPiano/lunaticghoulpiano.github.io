export function initializeTimelines() {
    document.querySelectorAll<HTMLElement>("[data-timeline-window]").forEach((root) => {
        if (root.dataset.ready) return;
        const viewport = root.querySelector<HTMLElement>("[data-timeline-scroll]")!;
        const list = viewport.querySelector<HTMLOListElement>("ol")!;
        const newest = root.querySelector<HTMLButtonElement>("[data-timeline-newest]")!;
        const oldest = root.querySelector<HTMLButtonElement>("[data-timeline-oldest]")!;
        const visibleItems = Number(root.dataset.visibleItems);
        const fixedHeight = root.dataset.height;

        function sync() {
            const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            newest.disabled = viewport.scrollTop <= 1;
            oldest.disabled = viewport.scrollTop >= maximum - 1;
            newest.hidden = maximum <= 1;
            oldest.hidden = maximum <= 1;
        }

        function resize() {
            if (viewport.clientWidth === 0) return;
            root.style.setProperty("--timeline-scrollbar-width", `${viewport.offsetWidth - viewport.clientWidth}px`);
            if (fixedHeight) {
                viewport.style.height = Number(fixedHeight) > 0 ? `${fixedHeight}px` : fixedHeight;
            }
            else {
                const items = [...list.children].filter((item) => ! (item as HTMLElement).hidden);
                if (items.length === 0) return;
                const lastVisible = items[Math.min(visibleItems, items.length) - 1];
                viewport.style.height = `${Math.ceil(lastVisible.getBoundingClientRect().bottom - list.getBoundingClientRect().top)}px`;
            }
            sync();
        }

        function jump(oldestEntry: boolean) {
            viewport.scrollTo({
                top: oldestEntry ? viewport.scrollHeight : 0,
                behavior: "instant",
            });
        }

        newest.addEventListener("click", () => jump(false));
        oldest.addEventListener("click", () => jump(true));
        viewport.addEventListener("scroll", sync, {
            passive: true,
        });
        root.addEventListener("timeline:change", resize);
        viewport.addEventListener("keydown", (event) => {
            if (event.target !== viewport || ! ["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            jump(event.key === "End");
        });
        new ResizeObserver(resize).observe(list);
        root.dataset.ready = "true";
        resize();
    });
}
