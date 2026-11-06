// The bevel displaces the live backdrop and reflects the pointer light.
const maps = new Map();
const ns = "http://www.w3.org/2000/svg";
let sequence = 0;

export function brickGeometry(width, height, corners, thickness) {
    const half = Math.min(width, height) / 2;
    const bevel = Math.min(thickness, half * .35);
    return { width, height, corners: corners.map(radius => Math.min(radius, half)), bevel, scale: 2 * bevel };
}

const pending = new Map();
let worker;
let job = 0;
// The worker is self-contained. Emit it as a static asset in both site builds,
// without injecting the documentation bundler's page-only chunk runtime.
const texturesURL = new URL("./textures.worker.js", import.meta.url);

function surfaceMaps(shape, geometry) {
    if (maps.has(shape)) return maps.get(shape);
    if (!globalThis.Worker || !globalThis.OffscreenCanvas || worker === null) return;
    if (!worker) {
        try {
            worker = new Worker(texturesURL, { type: "module" });
        } catch { worker = null; return; }
        worker.onmessage = ({ data: { id, textures } }) => {
            pending.get(id)?.(textures);
            pending.delete(id);
        };
        worker.onerror = () => {
            worker.terminate();
            worker = null;
            for (const resolve of pending.values()) resolve(null);
            pending.clear();
        };
    }
    const id = ++job;
    const result = new Promise(resolve => pending.set(id, resolve));
    worker.postMessage({ id, geometry });
    if (maps.size >= 32) maps.delete(maps.keys().next().value);
    maps.set(shape, result);
    return result;
}

export function mountBrick(host) {
    const lens = document.createElement("glass-lens");
    lens.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("focusable", "false");
    const filter = document.createElementNS(ns, "filter");
    filter.id = "site-glass-brick-" + ++sequence;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    for (const [key, value] of Object.entries({ x: "0", y: "0", width: "100%", height: "100%" })) filter.setAttribute(key, value);
    const image = document.createElementNS(ns, "feImage");
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("result", "offsets");
    const bend = document.createElementNS(ns, "feDisplacementMap");
    bend.setAttribute("in", "SourceGraphic");
    bend.setAttribute("in2", "offsets");
    bend.setAttribute("xChannelSelector", "R");
    bend.setAttribute("yChannelSelector", "G");
    filter.append(image, bend);
    svg.append(filter);
    lens.append(svg);
    host.prepend(lens);
    let lastShape;
    return {
        get connected() { return lens.isConnected; },
        measure(resized) {
            if (lastShape && !resized) return;
            const width = lens.clientWidth, height = lens.clientHeight;
            if (!width || !height) return;
            const style = getComputedStyle(lens);
            const corners = [style.borderTopLeftRadius, style.borderTopRightRadius,
                style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius => parseFloat(radius));
            const thickness = parseFloat(style.getPropertyValue("--glass-bevel"));
            const shape = [width, height, ...corners, thickness].join("/");
            if (shape === lastShape) return;
            return { shape, geometry: brickGeometry(width, height, corners, thickness) };
        },
        update({ shape, geometry }) {
            const { width, height } = geometry;
            lastShape = shape;
            surfaceMaps(shape, geometry)?.then(textures => {
                if (!textures || shape !== lastShape || !lens.isConnected) return;
                image.setAttribute("width", String(width));
                image.setAttribute("height", String(height));
                image.setAttribute("href", textures.displacement);
                lens.style.setProperty("--glass-reflection", `url("${textures.reflection}")`);
                bend.setAttribute("scale", String(geometry.scale));
                lens.style.setProperty("--glass-refraction", `url(#${filter.id})`);
            });
        },
        remove() { lens.remove(); },
    };
}
