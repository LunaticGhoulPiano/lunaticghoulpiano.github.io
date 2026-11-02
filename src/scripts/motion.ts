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

/** Switch one live result list without copying its rows, IDs or event handlers. */
export function createContentTransition(root: HTMLElement) {
    const body = root.querySelector<HTMLElement>("[data-content-transition-body]")!;
    const motion = createMotion();
    let pending: (() => void) | undefined;
    let x = 0;
    let opacity = 1;
    function apply() {
        const update = pending;
        pending = undefined;
        update?.();
    }
    function finish() {
        apply();
        motion.cancel();
    }
    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
        root.addEventListener(type, finish, { passive: true, capture: true });
    }
    window.addEventListener("pagehide", finish);
    window.addEventListener("beforeprint", finish);
    return {
        cancel() { motion.cancel(); },
        run(update: () => void, direction = 1) {
            const startX = x;
            const startOpacity = opacity;
            motion.cancel();
            pending = update;
            const wasInert = body.inert;
            root.style.minHeight = `${root.offsetHeight}px`;
            root.setAttribute("data-content-transition-active", "");
            body.inert = true;
            motion.run((progress) => {
                if (progress < 0.5) {
                    x = startX + (-direction * 100 - startX) * progress * 2;
                    opacity = startOpacity * (1 - progress * 2);
                }
                else {
                    apply();
                    x = direction * 100 * (2 - progress * 2);
                    opacity = progress * 2 - 1;
                }
                body.style.translate = `${x}% 0`;
                body.style.opacity = String(opacity);
            }, () => {
                pending = undefined;
                x = 0;
                opacity = 1;
                body.inert = wasInert;
                body.style.removeProperty("translate");
                body.style.removeProperty("opacity");
                root.style.removeProperty("min-height");
                root.removeAttribute("data-content-transition-active");
            });
        },
    };
}

export async function animateElement(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, signal: AbortSignal) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || signal.aborted) return;
    const animation = element.animate(frames, options);
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

/** Animate only entrance progress; CSS composes it with scrolling and focus. */
export async function revealItems(items: HTMLElement[], signal: AbortSignal, maxDelay = Infinity, lastGroup: HTMLElement[] = []) {
    const stagger = Math.min(45, maxDelay / Math.max(1, items.length - 1));
    // The final group shares the beat immediately after the last individual item.
    await Promise.all([...items, ...lastGroup].map(async (item, index) => {
        item.setAttribute("data-entering", "");
        try {
            await animateElement(item, [
                { "--entrance-progress": "0" }, { "--entrance-progress": "1" },
            ], {
                duration: 420, delay: Math.min(index, items.length) * stagger,
                easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards",
            }, signal);
        }
        finally { item.removeAttribute("data-entering"); }
    }));
}
