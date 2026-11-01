import type { TransitionBeforePreparationEvent } from "astro:transitions/client";
import { animateElement } from "./motion.ts";

let transition: { signal: AbortSignal } | undefined;

document.addEventListener("astro:before-preparation", (event: TransitionBeforePreparationEvent) => {
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
        await animateElement(current, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out" }, event.signal);
    };
});

document.addEventListener("astro:page-load", () => {
    const pending = transition;
    const page = document.querySelector<HTMLElement>("[data-profile-page]");
    if (!page) return;
    // Entrance lifecycle belongs to entrance.ts; this adapter owns only route focus.
    if (pending && !pending.signal.aborted) document.getElementById("main-content")?.focus({ preventScroll: true });
    transition = undefined;
});
