import { mountBrick } from "./brick.js";
import { createGlassCursor } from "./cursor.ts";

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

// Cache viewport geometry between layout changes. Moving the light alone
// only changes the reflections, never the displacement maps.
export function illuminateGlass({ surfaces, controls, rules } = {}) {
    const materials = '[data-glass="surface"], [data-glass="control"], [data-glass="item"], [data-glass="controls"] > button';
    const sharedControls = 'button, .dock-items a, .profile-nav a, .language-switcher a, .preset-choice';
    const targets = [materials, surfaces, controls, rules,
        sharedControls, '.focus-item', '[data-glass-rule]', '[data-glass-rows] > li', '.timeline-scroll ol > li > time',
    ].filter(Boolean).join(",");
    const visible = new Map();
    const tracked = new Set();
    const bricks = new Map();
    const resized = new WeakSet();
    const reactive = matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)");
    let pointer;
    let frame = 0;
    let reposition = false;
    let lightMoved = false;
    let wallpaper = document.querySelector(".desktop-background");
    let scene = "0px, 0px";
    const cursor = createGlassCursor();
    let modal = document.querySelector("dialog:modal");

    function clear(element) {
        if (!element.hasAttribute("data-glass-lit")) return;
        element.removeAttribute("data-glass-lit");
        for (const key of ["x", "y", "angle", "power"]) element.style.removeProperty("--glass-" + key);
    }
    function paint() {
        frame = 0;
        // The panel is moving as one layer; measure its controls at their final positions.
        if (modal?.open && modal.hasAttribute("data-panel-motion")) return;
        const boxes = [];
        for (const [element, cached] of visible) {
            if (modal?.isConnected && !modal.contains(element)) continue;
            if (cached && !reposition && !lightMoved) continue;
            const brick = bricks.get(element);
            const box = reposition || !cached ? element.getBoundingClientRect() : cached;
            visible.set(element, box);
            boxes.push({ element, brick, box, shape: brick?.measure(resized.delete(element)) });
        }
        // Read every size and computed bevel before any style write. Otherwise
        // each control can force layout again when the next one is measured.
        if (pointer && lightMoved && !modal?.isConnected) {
            scene = ((pointer.x / innerWidth - .5) * 8).toFixed(2) + "px, " + ((pointer.y / innerHeight - .5) * 6).toFixed(2) + "px";
            wallpaper?.style.setProperty("--scene-offset", scene);
        }
        for (const { element, brick, box, shape } of boxes) {
            if (shape) brick.update(shape);
            if (!pointer) continue;
            const light = lightOnGlass(box, pointer.x, pointer.y);
            element.toggleAttribute("data-glass-lit", true);
            element.style.setProperty("--glass-x", light.x.toFixed(1) + "px");
            element.style.setProperty("--glass-y", light.y.toFixed(1) + "px");
            element.style.setProperty("--glass-angle", light.angle.toFixed(3) + "rad");
            element.style.setProperty("--glass-power", light.power.toFixed(3));
        }
        reposition = false;
        lightMoved = false;
    }
    function schedule() {
        if (!frame) frame = requestAnimationFrame(paint);
    }
    function reset() {
        pointer = null;
        scene = "0px, 0px";
        wallpaper?.style.removeProperty("--scene-offset");
        for (const element of visible.keys()) clear(element);
    }
    function align() {
        reposition = true;
        schedule();
    }
    function resize() {
        for (const element of visible.keys()) resized.add(element);
        align();
    }
    function alignWithin(event) {
        const target = event.target;
        if (target === document || target === document.documentElement) return align();
        if (!(target instanceof Element) || target.closest("glass-lens, .ice-pointer") || target === wallpaper) return;
        for (const element of visible.keys()) if (target.contains(element)) {
            visible.set(element, null);
            schedule();
        }
    }
    const sizes = new ResizeObserver(entries => {
        for (const { target } of entries) {
            resized.add(target);
            if (visible.has(target)) visible.set(target, null);
        }
        // Resizing a brick can move its neighbours without changing their bevels.
        align();
    });
    sizes.observe(document.documentElement);
    function unmount(element) {
        bricks.get(element)?.remove();
        bricks.delete(element);
        sizes.unobserve(element);
    }
    const observer = new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
            if (isIntersecting && tracked.has(target)) {
                visible.set(target, null);
                if (target.matches(materials) && !bricks.has(target)) {
                    bricks.set(target, mountBrick(target));
                    sizes.observe(target);
                }
            } else {
                visible.delete(target);
                clear(target);
            }
        }
        schedule();
    });
    function register(root) {
        for (const element of root.querySelectorAll(targets)) observe(element);
        if (root.matches?.(targets)) observe(root);
    }
    function observe(element) {
        if (tracked.has(element)) return;
        if (surfaces && element.matches(surfaces)) element.dataset.glass = "surface";
        else if (controls && element.matches(controls)) element.dataset.glass = "control";
        else if (element.matches('.focus-item')) element.dataset.glass = "item";
        else if (element.matches(sharedControls) && !element.matches('label') && !element.hasAttribute("data-glass") && !element.closest('.focus-item, .glass-field')) element.dataset.glass = "control";
        if (element.matches(sharedControls) || (controls && element.matches(controls))) element.dataset.focusControl = "";
        if (rules && element.matches(rules)) element.dataset.glassRule = "";
        tracked.add(element);
        observer.observe(element);
    }
    const mutations = new MutationObserver(records => {
        for (const record of records) {
            if (record.attributeName === "data-panel-motion") {
                modal = document.querySelector("dialog:modal");
                align();
                continue;
            }
            for (const node of record.addedNodes) if (node instanceof HTMLElement && !node.matches(".ice-pointer, glass-lens")) register(node);
        }
        if (records.some(record => Array.from(record.removedNodes).some(node => node instanceof Element && !node.isConnected))) {
            for (const element of tracked) if (!element.isConnected) {
                tracked.delete(element);
                visible.delete(element);
                unmount(element);
                observer.unobserve(element);
                clear(element);
            }
            // React or a counter can replace a control's textContent. Restore
            // its one decorative lens without retaining stale SVG references.
            for (const [element, brick] of bricks) if (element.isConnected && !brick.connected) {
                bricks.set(element, mountBrick(element));
                reposition = true;
            }
        }
        if (records.some(record => record.target === document.documentElement)) {
            wallpaper = document.querySelector(".desktop-background");
            wallpaper?.style.setProperty("--scene-offset", scene);
            cursor.refresh();
            resize();
        } else if (reposition) schedule();
    });
    register(document);
    mutations.observe(document.documentElement, { childList: true, subtree: true, attributeFilter: ["data-panel-motion"] });
    const listeners = new AbortController();
    const options = { signal: listeners.signal, passive: true };
    function track(event) {
        if (!reactive.matches || event.pointerType === "touch") return;
        pointer = { x: event.clientX, y: event.clientY };
        lightMoved = true;
        schedule();
    }
    document.addEventListener("pointermove", track, options);
    document.addEventListener("pointerdown", event => {
        if (event.pointerType === "touch") reset();
    }, options);
    document.addEventListener("toggle", event => {
        if (!(event.target instanceof HTMLDialogElement)) return;
        modal = document.querySelector("dialog:modal");
        align();
    }, { ...options, capture: true });
    document.addEventListener("pointerout", event => { if (!event.relatedTarget) reset(); }, options);
    document.addEventListener("keydown", reset, options);
    document.addEventListener("scroll", alignWithin, { ...options, capture: true });
    document.addEventListener("animationend", alignWithin, options);
    document.addEventListener("transitionend", alignWithin, options);
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
        cursor.remove();
        for (const brick of bricks.values()) brick.remove();
    };
}
