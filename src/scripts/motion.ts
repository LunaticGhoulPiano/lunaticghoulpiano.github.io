import { createShatter } from "./glass/shatter.ts";

/** One cancellable ease-in/out clock for page, carousel and timeline movement. */
export function createMotion() {
    let cancelCurrent: (() => void) | undefined;
    return {
        get active() { return cancelCurrent !== undefined; },
        cancel() { cancelCurrent?.(); },
        run(draw: (progress: number) => void, cleanup: () => void = () => {}, duration = 560) {
            cancelCurrent?.();
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
            if (reduced.matches) {
                draw(1);
                cleanup();
                return;
            }
            let frame = 0;
            let start: number | undefined;
            function finish() {
                cancelAnimationFrame(frame);
                reduced.removeEventListener("change", preferenceChanged);
                cancelCurrent = undefined;
                cleanup();
            }
            function preferenceChanged() {
                if (reduced.matches) {
                    draw(1);
                    finish();
                }
            }
            function tick(now: number) {
                start ??= now;
                const time = Math.min(1, (now - start) / duration);
                const eased = time < 0.5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2;
                draw(eased);
                if (time === 1) finish();
                else frame = requestAnimationFrame(tick);
            }
            cancelCurrent = finish;
            reduced.addEventListener("change", preferenceChanged);
            draw(0);
            frame = requestAnimationFrame(tick);
        },
    };
}

/** Resources tied to the current Astro document, released before it is swapped. */
const pageCleanups = new Set<() => void>();
let cleanupBound = false;
export function onPageLeave(cleanup: () => void) {
    pageCleanups.add(cleanup);
    if (cleanupBound) return;
    cleanupBound = true;
    const dispose = () => { for (const run of pageCleanups) run(); pageCleanups.clear(); };
    document.addEventListener("astro:before-swap", dispose);
    window.addEventListener("pagehide", (event) => { if (!event.persisted) dispose(); });
}

export async function fadeContent(root: HTMLElement, signal: AbortSignal, leavesDocument = false) {
    const restore = () => root.style.removeProperty("opacity");
    root.style.opacity = "0";
    signal.addEventListener("abort", restore, { once: true });
    // A full navigation can freeze this DOM and restore it without another route update.
    if (leavesDocument) window.addEventListener("pagehide", restore, { once: true, signal });
    await animateElement(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out" }, signal);
}

const contentTransitions = new WeakMap<HTMLElement, ReturnType<typeof contentTransition>>();
export function createContentTransition(root: HTMLElement) {
    let controller = contentTransitions.get(root);
    if (!controller) { controller = contentTransition(root); contentTransitions.set(root, controller); }
    return controller;
}

/** Switch one live result list without copying its rows, IDs or event handlers. */
function contentTransition(root: HTMLElement) {
    const body = root.querySelector<HTMLElement>("[data-content-transition-body]")!;
    const motion = createMotion();
    let pending: (() => void) | undefined;
    let x = 0;
    let opacity = 1;
    let applying = false;
    let entrance: AbortController | undefined;
    function apply() {
        const update = pending;
        pending = undefined;
        applying = true;
        try { update?.(); } finally { applying = false; }
    }
    function finish() {
        apply();
        motion.cancel();
        entrance?.abort();
    }
    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
        root.addEventListener(type, finish, { passive: true, capture: true });
    }
    window.addEventListener("pagehide", finish);
    window.addEventListener("beforeprint", finish);
    onPageLeave(() => {
        motion.cancel(); entrance?.abort();
        window.removeEventListener("pagehide", finish);
        window.removeEventListener("beforeprint", finish);
    });
    return {
        cancel() { if (!applying) { motion.cancel(); entrance?.abort(); } },
        run(update: () => void, direction = 1, effect: "slide" | "fade" | "shatter" = "slide") {
            const startX = x;
            const startOpacity = opacity;
            motion.cancel();
            entrance?.abort();
            const controller = new AbortController();
            entrance = controller;
            let shards = effect === "shatter" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? createShatter(body) : undefined;
            pending = update;
            const wasInert = body.inert;
            root.style.minHeight = `${root.offsetHeight}px`;
            root.setAttribute("data-content-transition-active", "");
            body.inert = true;
            motion.run((progress) => {
                if (progress < 0.5) {
                    shards?.draw(progress * 2);
                    x = effect === "slide" ? startX + (-direction * 100 - startX) * progress * 2 : 0;
                    opacity = startOpacity * (1 - progress * 2);
                }
                else {
                    apply();
                    x = effect === "slide" ? direction * 100 * (2 - progress * 2) : 0;
                    opacity = progress * 2 - 1;
                    if (shards) {
                        shards.remove();
                        shards = undefined;
                        void revealItems([...body.querySelectorAll<HTMLElement>("[data-page-item]:not([hidden])")], controller.signal, 180);
                    }
                }
                body.style.translate = `${x}% 0`;
                body.style.opacity = String(effect === "shatter" && progress >= .5 ? 1 : opacity);
            }, () => {
                pending = undefined;
                x = 0;
                opacity = 1;
                body.inert = wasInert;
                body.style.removeProperty("translate");
                body.style.removeProperty("opacity");
                root.style.removeProperty("min-height");
                root.removeAttribute("data-content-transition-active");
                shards?.remove();
            }, effect === "fade" ? 240 : 560);
        },
    };
}

export async function animateElement(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, signal: AbortSignal, staged?: Animation[]) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || signal.aborted) return;
    const animation = element.animate(frames, options);
    if (staged) {
        animation.pause();
        animation.currentTime = 0;
        staged.push(animation);
    }
    const cancel = () => animation.cancel();
    const preferenceChanged = () => { if (reduced.matches) cancel(); };
    signal.addEventListener("abort", cancel, { once: true });
    reduced.addEventListener("change", preferenceChanged);
    try { await animation.finished; }
    catch { /* Navigation, interaction or reduced motion can finish an entrance early. */ }
    finally {
        signal.removeEventListener("abort", cancel);
        reduced.removeEventListener("change", preferenceChanged);
        animation.cancel();
    }
}

/** Independent translate keeps the timeline's transform and focus scale intact. */
export async function revealItems(items: HTMLElement[], signal: AbortSignal, maxDelay = Infinity, lastGroup: HTMLElement[] = []) {
    const stagger = Math.min(45, maxDelay / Math.max(1, items.length - 1));
    const staged: Animation[] = [];
    // The final group shares the beat immediately after the last individual item.
    const finished = Promise.all([...items, ...lastGroup].map(async (item, index) => {
        item.setAttribute("data-entering", "");
        try {
            // A neutral endpoint also restores each row's own opacity (including disabled controls).
            const frames: Keyframe[] = item.dataset.revealEffect === "gutter"
                ? [{ "--entrance-progress": "0" }, { "--entrance-progress": "1" }]
                : [{ offset: 0, translate: "40px -10px", opacity: 0 }, { offset: 1 }];
            await animateElement(item, frames, {
                duration: 420, delay: Math.min(index, items.length) * stagger,
                easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards",
            }, signal, staged);
        }
        finally { item.removeAttribute("data-entering"); }
    }));
    if (!staged.length) { await finished; return; }
    // Present the initialized page at rest first. Its first paint must not
    // consume the opening frames of the stagger on a busy page.
    let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
            for (const animation of staged) if (animation.playState === "paused") animation.play();
        });
    });
    try { await finished; }
    finally { cancelAnimationFrame(frame); }
}
