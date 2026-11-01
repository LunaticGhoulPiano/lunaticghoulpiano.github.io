import { revealItems } from "./motion.ts";

const revealed = new WeakSet<HTMLElement>();
let entrance: AbortController | undefined;

/** Reading order, limited to the screen and every nested scroll/clipping region. */
export function entranceItems(root: HTMLElement, viewportOnly = true) {
    const candidates = [...root.querySelectorAll<HTMLElement>("[data-reveal-item], [data-reveal-list] > ol > li")]
        .filter((item) => !item.closest("[hidden], [inert], [aria-hidden='true']"));
    if (!viewportOnly) return candidates.filter((item) => item.getClientRects().length > 0);
    const clipping = new Map<HTMLElement, { bounds: DOMRect; x: boolean; y: boolean }>();
    return candidates
        .map((item) => ({ item, bounds: item.getBoundingClientRect() }))
        .filter(({ item, bounds }) => {
            if (bounds.width <= 0 || bounds.height <= 0 || getComputedStyle(item).visibility !== "visible") return false;
            let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
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
            return bounds.right > left && bounds.left < right && bounds.bottom > top && bounds.top < bottom;
        })
        .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left)
        .map(({ item }) => item);
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
    const viewportOnly = root.dataset.entrance !== "all";
    try { await revealItems(entranceItems(root, viewportOnly), controller.signal, viewportOnly ? 270 : Infinity); }
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
