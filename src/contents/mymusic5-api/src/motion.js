import { initializeEntrances } from "../../../scripts/entrance.ts";

let finishSnapshot;
export function onRouteUpdate({ previousLocation, location }) {
    if (!previousLocation || previousLocation.pathname === location.pathname) return;
    const main = document.querySelector("main");
    // Link clicks have already faded. History traversal gets the same exit using
    // a browser snapshot, while Docusaurus owns loading and scroll restoration.
    finishSnapshot?.();
    if (main?.style.opacity !== "0" && document.startViewTransition) {
        const ready = new Promise(resolve => { finishSnapshot = resolve; });
        const transition = document.startViewTransition(() => ready);
        void transition.ready.catch(() => {});
    }
}
export function onRouteDidUpdate({ previousLocation, location }) {
    finishSnapshot?.();
    finishSnapshot = undefined;
    const main = document.querySelector("main");
    if (!main) return;
    main.style.removeProperty("opacity");
    if (previousLocation?.pathname === location.pathname) return;
    // Docusaurus reuses main between chapters; animate the new article root.
    const content = main.querySelector("article") ?? main;
    content.dataset.entrance = "";
    if (!previousLocation) {
        // The shared first-paint gate will reveal the hydrated article. If its
        // fallback has already made content visible, do not conceal it again.
        if (document.documentElement.hasAttribute("data-page-pending")) void initializeEntrances(content, true);
    } else void initializeEntrances(content, true);
}
