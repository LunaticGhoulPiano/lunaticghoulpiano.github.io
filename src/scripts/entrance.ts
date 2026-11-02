import { revealItems } from "./motion.ts";

const revealed = new WeakSet<HTMLElement>();
let entrance: AbortController | undefined;

function entranceItems(root: HTMLElement) {
    const all = root.dataset.entrance === "all";
    const withControls = root.dataset.entranceControls !== undefined;
    const content = "[data-reveal-item], [data-reveal-list] > ol > li";
    const candidates = root.querySelectorAll<HTMLElement>(withControls ? content + ", [data-reveal-last]" : content);
    const clipping = new Map<HTMLElement, { bounds: DOMRect; x: boolean; y: boolean }>();
    const items: HTMLElement[] = [];
    const controls: HTMLElement[] = [];
    const visible: { item: HTMLElement; bounds: DOMRect }[] = [];
    for (const item of candidates) {
        if (item.closest("[hidden], [inert], [aria-hidden='true']")) continue;
        const last = withControls && item.dataset.revealLast !== undefined;
        if (all && !last) {
            if (item.getClientRects().length) items.push(item);
            continue;
        }
        const bounds = item.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0 || getComputedStyle(item).visibility !== "visible") continue;
        let left = 0, right = window.innerWidth;
        // Bottom controls of an active column can sit below the fold.
        let top = last ? -Infinity : 0, bottom = last ? Infinity : window.innerHeight;
        for (let parent = item.parentElement; parent; parent = parent.parentElement) {
            let clip = clipping.get(parent);
            if (!clip) {
                const style = getComputedStyle(parent);
                clip = { bounds: parent.getBoundingClientRect(), x: style.overflowX !== "visible", y: style.overflowY !== "visible" };
                clipping.set(parent, clip);
            }
            if (clip.x) { left = Math.max(left, clip.bounds.left); right = Math.min(right, clip.bounds.right); }
            if (clip.y) { top = Math.max(top, clip.bounds.top); bottom = Math.min(bottom, clip.bounds.bottom); }
        }
        if (bounds.right <= left || bounds.left >= right || bounds.bottom <= top || bounds.top >= bottom) continue;
        if (last) controls.push(item);
        else visible.push({ item, bounds });
    }
    visible.sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
    return { items: all ? items : visible.map(({ item }) => item), controls };
}

export async function initializeEntrances() {
    const root = document.querySelector<HTMLElement>("[data-entrance]");
    if (!root || revealed.has(root)) return;
    revealed.add(root);
    entrance?.abort();
    const controller = new AbortController();
    entrance = controller;
    // Interaction takes over immediately; switching sources never replays the entrance.
    const stop = () => controller.abort();
    const events = ["pointerdown", "touchstart", "wheel", "keydown", "scroll"];
    events.forEach((type) => root.addEventListener(type, stop, { capture: true, passive: true }));
    try {
        const { items, controls } = entranceItems(root);
        await revealItems(items, controller.signal, root.dataset.entrance === "all" ? Infinity : 270, controls);
    }
    finally {
        events.forEach((type) => root.removeEventListener(type, stop, true));
        if (entrance === controller) entrance = undefined;
    }
}

document.addEventListener("astro:before-preparation", () => entrance?.abort());
// The head bootstrap emits this only while the initialized page is concealed.
// Late modules and timeout fallbacks must not hide already-visible content again.
document.addEventListener("site:page-ready", initializeEntrances);
window.addEventListener("pagehide", () => entrance?.abort());
