import { youtubeVideoSortOptions } from "../config/collections.ts";
import { createListSearch } from "./list_search.ts";

export function initializeYoutubePlaylists() {
    document.querySelectorAll<HTMLElement>("[data-youtube-browser]").forEach((root) => {
        if (root.dataset.ready) return;
        const controls = root.querySelector<HTMLElement>("[data-youtube-controls]");
        const sort = root.querySelector<HTMLSelectElement>("[data-youtube-sort]")!;
        const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-youtube-filter]")];
        const list = root.querySelector<HTMLOListElement>(".youtube-videos")!;
        const rows = new Map([...list.children].map((item) => [(item as HTMLElement).dataset.videoId!, item as HTMLElement]));
        const description = root.querySelector<HTMLElement>("[data-youtube-description]")!;
        const empty = root.querySelector<HTMLElement>("[data-youtube-empty]")!;
        const timeline = root.querySelector<HTMLElement>("[data-timeline-window]")!;
        const viewport = timeline.querySelector<HTMLElement>("[data-timeline-scroll]")!;
        const duplicates: HTMLElement[] = [];
        const search = createListSearch(root, [...rows.values()], render);
        let ids = [...rows.values()].filter((row) => ! row.hidden).map((row) => row.dataset.videoId!);
        let playlist = false;
        const metrics = new Map([...rows].map(([id, row]) => [id, {
            publishedAt: Date.parse(row.querySelector("time")!.getAttribute("datetime")!),
            views: row.dataset.videoViews === undefined ? null : BigInt(row.dataset.videoViews),
            likes: row.dataset.videoLikes === undefined ? null : BigInt(row.dataset.videoLikes),
        }]));
        type Metrics = NonNullable<ReturnType<typeof metrics.get>>;
        function descendingCount(left: bigint | null, right: bigint | null) {
            if (left === right) return 0;
            if (left === null) return 1;
            if (right === null) return -1;
            return left > right ? -1 : 1;
        }
        const comparisons: Record<typeof youtubeVideoSortOptions[number], (left: Metrics, right: Metrics) => number> = {
            newest: (left, right) => right.publishedAt - left.publishedAt,
            oldest: (left, right) => left.publishedAt - right.publishedAt,
            mostViewed: (left, right) => descendingCount(left.views, right.views),
            mostLiked: (left, right) => descendingCount(left.likes, right.likes),
        };

        function render() {
            for (const duplicate of duplicates.splice(0)) duplicate.remove();
            for (const row of rows.values()) row.hidden = true;
            const compare = comparisons[sort.value as keyof typeof comparisons] ?? comparisons[youtubeVideoSortOptions[0]];
            const sorted = ids.filter((id) => search.matches(rows.get(id)!))
                .sort((left, right) => compare(metrics.get(left)!, metrics.get(right)!));
            const used = new Set<string>();
            for (const id of sorted) {
                const original = rows.get(id)!;
                const row = used.has(id) ? original.cloneNode(true) as HTMLElement : original;
                if (row !== original) duplicates.push(row);
                used.add(id);
                row.hidden = false;
                search.highlight(row);
                list.append(row);
            }
            empty.textContent = search.active ? empty.dataset.searchLabel! : playlist ? empty.dataset.playlistLabel! : empty.dataset.allLabel!;
            empty.hidden = sorted.length > 0;
            viewport.scrollTop = 0;
            timeline.dispatchEvent(new Event("timeline:change"));
        }

        function resetSort() {
            sort.value = youtubeVideoSortOptions[0];
            render();
        }

        for (const button of buttons) {
            button.addEventListener("carousel:select", () => {
                ids = JSON.parse(button.dataset.videoIds!);
                playlist = Boolean(button.dataset.youtubeFilter);
                description.textContent = button.dataset.description!;
                render();
            });
        }
        sort.addEventListener("change", render);
        window.addEventListener("pageshow", resetSort);
        resetSort();
        root.querySelector<HTMLElement>("[data-youtube-sort-controls]")!.hidden = false;
        if (controls) controls.hidden = false;
        root.dataset.ready = "true";
    });
}
