// Runs in the head, before content can paint. No JavaScript means no gate.
(() => {
    let pending = false;
    let frame = 0;
    let timeout = 0;

    function release(animate = false) {
        if (!pending) return;
        pending = false;
        cancelAnimationFrame(frame);
        clearTimeout(timeout);
        try {
            // Entrance listeners prepare their first frame synchronously, while
            // the initialized layout is still concealed by the shared gate.
            if (animate) document.dispatchEvent(new Event("site:page-ready"));
        }
        finally {
            document.documentElement.removeAttribute("data-page-pending");
        }
    }

    function prepare(root = document.documentElement) {
        pending = true;
        root.setAttribute("data-page-pending", "");
        // Failed or stalled modules must never leave readable HTML concealed.
        timeout = setTimeout(() => release(), 4000);
    }

    function ready() {
        if (!pending) return;
        cancelAnimationFrame(frame);
        // Module initializers, DOM-ready handlers and the initial carousel /
        // timeline layout frames settle before any entrance is presented.
        frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => release(true));
        });
    }

    prepare();
    document.addEventListener("DOMContentLoaded", ready, { once: true });
    document.addEventListener("astro:before-swap", (event) => {
        release();
        prepare(event.newDocument.documentElement);
    });
    document.addEventListener("astro:page-load", ready);
    window.addEventListener("pagehide", () => release());
    window.addEventListener("pageshow", (event) => { if (event.persisted) release(); });
    for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) {
        document.addEventListener(type, () => release(), { capture: true, passive: true });
    }
})();
