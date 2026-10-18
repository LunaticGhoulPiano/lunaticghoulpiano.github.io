interface Options {
    interval: number;
    advance: () => void;
    canAdvance: () => boolean;
}

export function createAutoAdvance(root: HTMLElement, { interval, advance, canAdvance }: Options) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hovered = root.matches(":hover");
    let timer: ReturnType<typeof setTimeout> | undefined;

    function cancel() {
        clearTimeout(timer);
        timer = undefined;
    }

    function schedule() {
        cancel();
        root.dataset.paused = String(hovered);
        if (! hovered && canAdvance() && Number.isFinite(interval) && interval > 0) {
            timer = setTimeout(advance, interval);
        }
    }

    function setHovered(value: boolean) {
        if (hovered === value) return;
        hovered = value;
        schedule();
    }

    root.addEventListener("mouseenter", () => setHovered(true));
    root.addEventListener("mouseleave", () => setHovered(false));
    // Leaving the window can retain :hover without sending mouseleave.
    window.addEventListener("blur", () => setHovered(false));
    window.addEventListener("focus", () => setHovered(root.matches(":hover")));
    document.addEventListener("visibilitychange", () => {
        setHovered(! document.hidden && root.matches(":hover"));
    });
    return { cancel, schedule, reducedMotion };
}
