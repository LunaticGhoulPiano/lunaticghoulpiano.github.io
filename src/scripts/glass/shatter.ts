/** Decorative material fragments only; live content and its semantics stay intact. */
export function createShatter(root: HTMLElement) {
    const layer = document.createElement("div");
    layer.className = "glass-fragments";
    layer.setAttribute("aria-hidden", "true");
    const viewport = { width: innerWidth, height: innerHeight };
    const boxes = [...root.querySelectorAll<HTMLElement>("[data-page-item]:not([hidden])")]
        .map(item => item.getBoundingClientRect())
        .filter(box => box.bottom > 0 && box.top < viewport.height && box.right > 0 && box.left < viewport.width);
    const fragments: { node: HTMLElement; x: number; y: number; turn: number }[] = [];
    const columns = Math.max(1, Math.min(4, Math.floor((60 / Math.max(1, boxes.length) - 2) / 2)));
    for (const box of boxes.slice(0, 15)) {
        const cx = .35 + Math.random() * .3, cy = .35 + Math.random() * .3;
        const divisions = Array.from({ length: columns + 1 }, (_, index) => index === 0 ? 0 : index === columns ? 1 : (index + (Math.random() - .5) * .5) / columns);
        const perimeter = [...divisions.map(x => [x, 0]), ...divisions.toReversed().map(x => [x, 1])];
        for (let index = 0; index < perimeter.length; index++) {
            const a = perimeter[index], b = perimeter[(index + 1) % perimeter.length];
            const left = Math.min(cx, a[0], b[0]), top = Math.min(cy, a[1], b[1]);
            const width = Math.max(cx, a[0], b[0]) - left, height = Math.max(cy, a[1], b[1]) - top;
            const polygon = [[cx, cy], a, b].map(([x, y]) => `${(x - left) / width * 100}% ${(y - top) / height * 100}%`).join(",");
            const node = document.createElement("span");
            node.style.cssText = `left:${box.left + left * box.width}px;top:${box.top + top * box.height}px;width:${width * box.width}px;height:${height * box.height}px;clip-path:polygon(${polygon});`;
            layer.append(node);
            fragments.push({ node, x: (a[0] + b[0] - 1) * (24 + Math.random() * 44), y: (a[1] + b[1] - 1) * (12 + Math.random() * 30), turn: (Math.random() - .5) * 18 });
        }
    }
    document.body.append(layer);
    return {
        draw(progress: number) {
            for (const { node, x, y, turn } of fragments) {
                node.style.transform = `translate(${x * progress}px,${y * progress}px) rotate(${turn * progress}deg)`;
                node.style.opacity = String(Math.sin(Math.PI * progress) * .85);
            }
        },
        remove() { layer.remove(); },
    };
}
