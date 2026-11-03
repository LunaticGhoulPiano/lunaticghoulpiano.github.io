import { mountBrick } from "./brick.js";

export function lightOnGlass(box, x, y) {
    const localX = x - box.left;
    const localY = y - box.top;
    const nearestX = Math.min(box.width, Math.max(0, localX));
    const nearestY = Math.min(box.height, Math.max(0, localY));
    const distance = Math.hypot(localX - nearestX, localY - nearestY);
    return {
        x: nearestX, y: nearestY,
        angle: Math.atan2(localY - box.height / 2, localX - box.width / 2),
        power: .10 + .60 / (1 + distance / 160) ** 2,
    };
}

// One light per document. Only visible reflectors are measured, in one read
// pass per frame. Changing a highlight never invalidates a displacement map.
export function illuminateGlass({ surfaces, controls, rules } = {}) {
    const materials = '[data-glass="surface"], [data-glass="control"], [data-glass="controls"] > button';
    const targets = [materials, surfaces, controls, rules,
        '[data-glass-rule]', '[data-glass-rows] > li', '.timeline-scroll ol > li > time',
    ].filter(Boolean).join(",");
    const visible = new Set();
    const tracked = new Set();
    const bricks = new Map();
    const reactive = matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)");
    let pointer;
    let frame = 0;
    let reposition = false;
    let measureShape = false;

    function clear(element) {
        if (!element.hasAttribute("data-glass-lit")) return;
        element.removeAttribute("data-glass-lit");
        for (const key of ["x", "y", "angle", "power"]) element.style.removeProperty("--glass-" + key);
    }
    function paint() {
        frame = 0;
        const root = document.documentElement;
        const viewport = measureShape && [root.clientWidth, root.clientHeight];
        const boxes = [];
        for (const element of visible) {
            const brick = bricks.get(element);
            if (pointer || brick) boxes.push({ element, brick, box: element.getBoundingClientRect(),
                shape: reposition && brick?.measure(measureShape) });
        }
        // Read every size and computed bevel before any style write. Otherwise
        // each control can force layout again when the next one is measured.
        if (viewport) {
            root.style.setProperty("--photo-width", viewport[0] + "px");
            root.style.setProperty("--photo-height", viewport[1] + "px");
        }
        for (const { element, brick, box, shape } of boxes) {
            if (reposition) brick?.align(box, shape);
            if (!pointer) continue;
            const light = lightOnGlass(box, pointer.x, pointer.y);
            element.toggleAttribute("data-glass-lit", true);
            element.style.setProperty("--glass-x", light.x.toFixed(1) + "px");
            element.style.setProperty("--glass-y", light.y.toFixed(1) + "px");
            element.style.setProperty("--glass-angle", light.angle.toFixed(3) + "rad");
            element.style.setProperty("--glass-power", light.power.toFixed(3));
        }
        reposition = false;
        measureShape = false;
    }
    function schedule() {
        if ((pointer || reposition) && !frame) frame = requestAnimationFrame(paint);
    }
    function reset() {
        pointer = null;
        for (const element of visible) clear(element);
    }
    function align() {
        reposition = true;
        schedule();
    }
    function resize() {
        measureShape = true;
        align();
    }
    const sizes = new ResizeObserver(resize);
    sizes.observe(document.documentElement);
    function unmount(element) {
        bricks.get(element)?.remove();
        bricks.delete(element);
        sizes.unobserve(element);
    }
    const observer = new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
            if (isIntersecting && tracked.has(target)) {
                visible.add(target);
                if (target.matches(materials) && !bricks.has(target)) {
                    bricks.set(target, mountBrick(target));
                    sizes.observe(target);
                }
            } else {
                visible.delete(target);
                clear(target);
            }
        }
        align();
    });
    function register(root) {
        for (const element of root.querySelectorAll(targets)) observe(element);
        if (root.matches?.(targets)) observe(root);
    }
    function observe(element) {
        if (tracked.has(element)) return;
        if (surfaces && element.matches(surfaces)) element.dataset.glass = "surface";
        else if (controls && element.matches(controls)) element.dataset.glass = "control";
        if (rules && element.matches(rules)) element.dataset.glassRule = "";
        tracked.add(element);
        observer.observe(element);
    }
    const mutations = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof HTMLElement) register(node);
        }
        if (records.some(record => record.removedNodes.length)) {
            for (const element of tracked) if (!element.isConnected) {
                tracked.delete(element);
                visible.delete(element);
                unmount(element);
                observer.unobserve(element);
                clear(element);
            }
        }
        schedule();
    });
    register(document);
    mutations.observe(document.documentElement, { childList: true, subtree: true });
    const listeners = new AbortController();
    const options = { signal: listeners.signal, passive: true };
    document.addEventListener("pointermove", event => {
        if (!reactive.matches || event.pointerType === "touch") return;
        pointer = { x: event.clientX, y: event.clientY };
        schedule();
    }, options);
    document.addEventListener("pointerdown", event => { if (event.pointerType === "touch") reset(); }, options);
    document.addEventListener("pointerout", event => { if (!event.relatedTarget) reset(); }, options);
    document.addEventListener("keydown", reset, options);
    document.addEventListener("scroll", align, { ...options, capture: true });
    document.addEventListener("animationend", align, options);
    document.addEventListener("transitionend", align, options);
    window.addEventListener("resize", resize, options);
    window.addEventListener("blur", reset, options);
    reactive.addEventListener("change", reset, options);
    return () => {
        listeners.abort();
        mutations.disconnect();
        observer.disconnect();
        sizes.disconnect();
        cancelAnimationFrame(frame);
        reset();
        for (const brick of bricks.values()) brick.remove();
        document.documentElement.style.removeProperty("--photo-width");
        document.documentElement.style.removeProperty("--photo-height");
    };
}
