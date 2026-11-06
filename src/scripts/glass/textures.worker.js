// Generate both optical maps off the UI thread in the SVG filter's colour space.
self.onmessage = ({ data: { id, geometry } }) => {
    surfaceMaps(geometry).then(
        textures => self.postMessage({ id, textures }),
        () => self.postMessage({ id, textures: null }),
    );
};

async function surfaceMaps({ width, height, corners, bevel }) {
    const resolution = Math.min(1, 768 / Math.max(width, height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * resolution)), Math.max(1, Math.round(height * resolution)));
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    const reflection = ctx.createImageData(canvas.width, canvas.height);
    const glassIndex = 1.5;
    for (let j = 0; j < canvas.height; j++) {
        const y = ((j + .5) / canvas.height - .5) * height;
        for (let i = 0; i < canvas.width; i++) {
            const x = ((i + .5) / canvas.width - .5) * width;
            const radius = y < 0 ? corners[x < 0 ? 0 : 1] : corners[x < 0 ? 3 : 2];
            const dx = Math.abs(x) - width / 2 + radius;
            const dy = Math.abs(y) - height / 2 + radius;
            const cornerDistance = Math.hypot(Math.max(0, dx), Math.max(0, dy));
            const depth = radius - cornerDistance - Math.min(0, Math.max(dx, dy));
            const offset = (j * canvas.width + i) * 4;
            pixels.data[offset] = pixels.data[offset + 1] = 128;
            pixels.data[offset + 3] = 255;
            if (depth >= bevel) continue;

            // Circular cross-section viewed head-on. The normal tilts towards
            // the rim; Snell's law gives the ray direction inside the glass.
            const sinIncident = 1 - Math.max(0, depth) / bevel;
            const cosIncident = Math.sqrt(1 - sinIncident ** 2);
            const deflection = Math.asin(sinIncident) - Math.asin(sinIncident / glassIndex);
            const shift = .5 * (1 + cosIncident) * Math.tan(deflection);
            const nx = cornerDistance ? Math.max(0, dx) / cornerDistance : Number(dx >= dy);
            const ny = cornerDistance ? Math.max(0, dy) / cornerDistance : Number(dy > dx);
            pixels.data[offset] -= 127.5 * Math.sign(x) * nx * shift;
            pixels.data[offset + 1] -= 127.5 * Math.sign(y) * ny * shift;
            reflection.data[offset + 3] = Math.round(255 * sinIncident ** 2);
        }
    }
    ctx.putImageData(pixels, 0, 0);
    const reader = new FileReaderSync();
    const displacement = canvas.convertToBlob();
    ctx.putImageData(reflection, 0, 0);
    const [offsets, highlights] = await Promise.all([displacement, canvas.convertToBlob()]);
    return {
        displacement: reader.readAsDataURL(offsets),
        reflection: reader.readAsDataURL(highlights),
    };
}
