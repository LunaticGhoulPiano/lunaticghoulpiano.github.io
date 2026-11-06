// The native pointer and the moving cube use the same five visible glass faces.
const size = 16;
const tilt = 55;
const yaw = 40;
type Vector = readonly [number, number, number];
const faces: readonly (readonly [Vector, Vector, Vector])[] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
];

function project([x, y, z]: Vector) {
    const a = yaw * Math.PI / 180, b = tilt * Math.PI / 180;
    const depth = x * Math.sin(a) + y * Math.cos(a);
    return [x * Math.cos(a) - y * Math.sin(a), depth * Math.cos(b) - z * Math.sin(b),
        depth * Math.sin(b) + z * Math.cos(b)];
}

function createCube() {
    const sprite = document.createElement("span");
    sprite.className = "ice-pointer";
    sprite.setAttribute("aria-hidden", "true");
    sprite.popover = "manual";
    const view = document.createElement("span");
    view.style.transform = `rotateX(${tilt}deg) rotateZ(${yaw}deg)`;
    const cube = document.createElement("span");
    sprite.append(view);
    view.append(cube);

    let silhouette = "";
    for (const [index, [u, v, n]] of faces.entries()) {
        const id = "ice-facet-" + index;
        const face = `<defs><linearGradient id="${id}" x2=".85" y2="1">
          <stop stop-color="white" stop-opacity=".86"/><stop offset=".21" stop-color="#d7f7ff" stop-opacity=".18"/>
          <stop offset=".61" stop-color="#b2e7ef" stop-opacity=".06"/><stop offset="1" stop-color="#629cae" stop-opacity=".58"/>
        </linearGradient></defs>
        <rect x=".45" y=".45" width="15.1" height="15.1" rx=".8" fill="url(#${id})" stroke="#37596b" stroke-opacity=".72" stroke-width=".9"/>
        <path d="M1.4 13.2 1 1.2 13.5 1M14.8 4.1l.1 10.8-4.8.1" fill="none" stroke="white" stroke-opacity=".92" stroke-width=".86"/>
        <path d="m4 5 2.3 3.1-.8 4.3m.8-4.3 2.9 1.1" fill="none" stroke="#e0faff" stroke-opacity=".61" stroke-width=".55"/>`;
        const plane = document.createElement("span");
        plane.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${face}</svg>`;
        plane.style.transform = `matrix3d(${u},0,${v},0,${n},0,${n.map(k => k * size / 2)},1)`;
        cube.append(plane);

        const normal = project(n);
        if (normal[2] <= 0) continue;
        const [ux, uy] = project(u), [vx, vy] = project(v);
        const x = 16 + (normal[0] - ux - vx) * size / 2;
        const y = 16 + (normal[1] - uy - vy) * size / 2;
        silhouette += `<g transform="matrix(${ux} ${uy} ${vx} ${vy} ${x} ${y})">${face}</g>`;
    }
    function nativeImage(glow: boolean) {
        const halo = '<filter id="halo" x="-.5" y="-.5" width="2" height="2"><feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#b5efff"/></filter>';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${glow ? halo : ""}<g${glow ? ' filter="url(#halo)"' : ""}>${silhouette}</g></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, auto`;
    }
    return { sprite, cube, rest: nativeImage(false), lit: nativeImage(true) };
}

export function createGlassCursor() {
    const root = document.documentElement;
    const { sprite, cube, rest, lit } = createCube();
    const fine = matchMedia("(any-hover: hover) and (any-pointer: fine) and (forced-colors: none)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let pressed: number | null = null;
    let turn: Animation | undefined;
    let startAngle = 0;
    let endAngle = -360;
    let point: { x: number; y: number } | undefined;
    let overScrollbar = false;

    function native() {
        const image = pressed === null ? rest : lit;
        if (root.style.getPropertyValue("--glass-pointer") !== image) root.style.setProperty("--glass-pointer", image);
    }
    function restCursor() {
        if (typeof sprite.hidePopover === "function" && sprite.matches(":popover-open")) sprite.hidePopover();
        root.removeAttribute("data-ice-turn");
        native();
    }
    function reset() {
        pressed = null;
        sprite.removeAttribute("data-pressed");
        point = undefined;
        turn?.cancel();
        turn = undefined;
        restCursor();
    }
    function position() {
        if (point) sprite.style.translate = `${point.x - 16}px ${point.y - 16}px`;
    }
    function show() {
        if (!turn || !point || overScrollbar) return;
        // A dialog opened by this click enters the top layer after the pointer.
        const host = document.querySelector("dialog:modal") ?? document.body;
        if (sprite.parentElement !== host) host.append(sprite);
        position();
        if (!sprite.matches(":popover-open")) sprite.showPopover();
        root.toggleAttribute("data-ice-turn", true);
    }
    function locate(event: PointerEvent) {
        point = { x: event.clientX, y: event.clientY };
        overScrollbar = point.x >= root.clientWidth || point.y >= root.clientHeight;
        const el = event.target;
        if (overScrollbar || !(el instanceof HTMLElement) || el === root) return;
        const vertical = el.scrollHeight > el.clientHeight && el.offsetWidth > el.clientWidth;
        const horizontal = el.scrollWidth > el.clientWidth && el.offsetHeight > el.clientHeight;
        if (!vertical && !horizontal) return;
        const box = el.getBoundingClientRect();
        overScrollbar = (vertical && point.x >= box.left + el.clientLeft + el.clientWidth)
            || (horizontal && point.y >= box.top + el.clientTop + el.clientHeight);
    }
    function move(event: PointerEvent) {
        if (!turn && pressed === null) return;
        if (event.pointerType === "touch") return;
        if (pressed === event.pointerId && !(event.buttons & 1)) release(event);
        if (!turn) return;
        locate(event);
        if (overScrollbar) restCursor();
        else if (turn && !sprite.matches(":popover-open")) show();
        else position();
    }
    function press(event: PointerEvent) {
        if (!fine.matches || event.pointerType === "touch" || event.button !== 0) return;
        pressed = event.pointerId;
        locate(event);
        native();
        sprite.toggleAttribute("data-pressed", true);
        if (overScrollbar || reduced.matches || typeof sprite.showPopover !== "function") return;
        const progress = Number(turn?.effect?.getComputedTiming().progress ?? 0);
        const spinning = !!turn;
        startAngle = spinning ? (startAngle + (endAngle - startAngle) * progress) % 360 : 0;
        // Aim one revolution ahead of the current pose, ending on the native cube's orientation.
        endAngle = (Math.round(startAngle / 360) - 1) * 360;
        turn?.cancel();
        const animation = cube.animate([
            { transform: `rotateZ(${startAngle}deg)` }, { transform: `rotateZ(${endAngle}deg)` },
        ], { duration: 500, easing: spinning ? "ease-out" : "ease-in-out" });
        turn = animation;
        show();
        animation.onfinish = () => {
            if (turn !== animation) return;
            turn = undefined;
            restCursor();
        };
    }
    function release(event: PointerEvent) {
        if (event.pointerId !== pressed) return;
        pressed = null;
        sprite.removeAttribute("data-pressed");
        native();
    }
    const listeners = new AbortController();
    const options = { signal: listeners.signal, capture: true, passive: true };
    window.addEventListener("pointerdown", press, options);
    window.addEventListener("pointermove", move, options);
    window.addEventListener("pointerup", release, options);
    window.addEventListener("pointercancel", reset, options);
    window.addEventListener("pointerout", event => {
        if (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0
            || event.clientX >= innerWidth || event.clientY >= innerHeight)) reset();
    }, options);
    window.addEventListener("blur", reset, { signal: listeners.signal });
    window.addEventListener("pagehide", reset, options);
    document.addEventListener("toggle", event => { if (event.target instanceof HTMLDialogElement) show(); }, options);
    fine.addEventListener("change", reset, options);
    reduced.addEventListener("change", reset, options);
    function refresh() {
        root.style.setProperty("--glass-pressed-pointer", lit);
        native();
        show();
    }
    refresh();
    return {
        refresh,
        remove() {
            listeners.abort(); reset(); sprite.remove();
            root.style.removeProperty("--glass-pointer");
            root.style.removeProperty("--glass-pressed-pointer");
        },
    };
}
