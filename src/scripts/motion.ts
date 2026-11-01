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
export async function revealItems(items: HTMLElement[], signal: AbortSignal, maxDelay = Infinity) {
    const stagger = Math.min(45, maxDelay / Math.max(1, items.length - 1));
    await Promise.all(items.map(async (item, index) => {
        item.setAttribute("data-entering", "");
        try {
            await animateElement(item, [
                { "--entrance-progress": "0" }, { "--entrance-progress": "1" },
            ], {
                duration: 420, delay: index * stagger,
                easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards",
            }, signal);
        }
        finally { item.removeAttribute("data-entering"); }
    }));
}
