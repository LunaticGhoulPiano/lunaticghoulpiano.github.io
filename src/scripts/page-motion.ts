import type { TransitionBeforePreparationEvent } from "astro:transitions/client";
import { fadeContent } from "./motion.ts";

let transition: { signal: AbortSignal; focus: boolean } | undefined;

document.addEventListener("astro:before-preparation", (event: TransitionBeforePreparationEvent) => {
    const loader = event.loader;
    event.loader = async () => {
        await loader();
        const current = document.querySelector<HTMLElement>("[data-page-content]");
        const next = event.newDocument.querySelector<HTMLElement>("[data-page-content], .docs-wrapper");
        // Docusaurus deliberately uses a full navigation; Astro marks that
        // response prevented, but it can still share the outgoing fade.
        if (event.signal.aborted || !current || !next || event.newDocument === document) return;
        const pending = { signal: event.signal, focus: event.navigationType !== "traverse" };
        transition = pending;
        event.signal.addEventListener("abort", () => {
            if (transition === pending) transition = undefined;
        }, { once: true });
        await fadeContent(current, event.signal, event.defaultPrevented);
    };
});

document.addEventListener("astro:page-load", () => {
    const pending = transition;
    const page = document.querySelector<HTMLElement>("[data-page-content]");
    if (!page) return;
    // Entrance lifecycle belongs to entrance.ts; this adapter owns only route focus.
    if (pending?.focus && !pending.signal.aborted) document.getElementById("main-content")?.focus({ preventScroll: true });
    transition = undefined;
});
