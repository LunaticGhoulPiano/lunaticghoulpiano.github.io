import type { TransitionBeforePreparationEvent } from "astro:transitions/client";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let transition: { signal: AbortSignal } | undefined;
let entrance: AbortController | undefined;
const revealed = new WeakSet<HTMLElement>();

async function animate(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, signal: AbortSignal) {
    if (reducedMotion() || signal.aborted) return;
    const animation = element.animate(frames, options);
    const cancel = () => animation.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try { await animation.finished; }
    catch { /* A newer navigation cancels the previous animation. */ }
    finally {
        signal.removeEventListener("abort", cancel);
        animation.cancel();
    }
}

async function reveal(page: HTMLElement) {
    if (revealed.has(page)) return;
    revealed.add(page);
    const controller = new AbortController();
    entrance = controller;
    // DOM order follows the reading order, including wrapped rows on small screens.
    const items = Array.from(page.querySelectorAll<HTMLElement>([
        ".profile-name", ".name-alias", ".profile-nav a", ".social-links > li",
        "#profile-content > h1", ".profile-fields > div > *", ".post-list > li",
    ].join(","))).filter((item) => item.getClientRects().length > 0);
    const finished = Promise.all(items.map((item, index) => animate(item, [
        { opacity: 0, transform: "translate(40px, -10px)" },
        { opacity: 1, transform: "translate(0, 0)" },
    ], {
        duration: 420, delay: index * 45, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards",
    }, controller.signal)));
    page.style.removeProperty("opacity");
    try { await finished; }
    finally { if (entrance === controller) entrance = undefined; }
}

document.addEventListener("astro:before-preparation", (event: TransitionBeforePreparationEvent) => {
    // Finish an in-progress entrance before another navigation or a failed load.
    entrance?.abort();
    // Only the shared Profile navigation opts into this sequence. History traversal,
    // language changes, and other sections keep the router's normal navigation.
    if (event.navigationType === "traverse" || !event.sourceElement?.closest("[data-profile-link]")) return;
    const loader = event.loader;
    event.loader = async () => {
        await loader();
        const current = document.querySelector<HTMLElement>("[data-profile-page]");
        const next = event.newDocument.querySelector<HTMLElement>("[data-profile-page]");
        if (event.defaultPrevented || event.signal.aborted || !current || !next || event.newDocument === document) return;
        const pending = { signal: event.signal };
        transition = pending;
        event.signal.addEventListener("abort", () => {
            document.querySelector<HTMLElement>("[data-profile-page]")?.style.removeProperty("opacity");
            if (transition === pending) transition = undefined;
        }, { once: true });
        current.style.opacity = "0";
        await animate(current, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out" }, event.signal);
        if (!event.signal.aborted) next.style.opacity = "0";
    };
});

async function initializeProfileMotion() {
    const pending = transition;
    const page = document.querySelector<HTMLElement>("[data-profile-page]");
    if (!page) return;
    try {
        // Leave scroll positioning to the router; focus includes the identity and navigation.
        if (pending && !pending.signal.aborted) document.getElementById("main-content")?.focus({ preventScroll: true });
        await reveal(page);
    }
    finally {
        if (transition === pending) transition = undefined;
    }
}

document.addEventListener("astro:page-load", initializeProfileMotion);
// Initial entrance must not wait for window.load (wallpaper and other assets).
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeProfileMotion, { once: true });
} else {
    void initializeProfileMotion();
}
