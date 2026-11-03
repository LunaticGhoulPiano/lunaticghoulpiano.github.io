// Generate both optical maps off the UI thread in the SVG filter's colour space.
self.onmessage = ({ data: { id, geometry } }) => {
    Promise.resolve().then(() => surfaceMaps(geometry)).then(
        textures => self.postMessage({ id, textures }),
        () => self.postMessage({ id, textures: null }),
    );
};

function surfaceMaps({ width, height, corners, bevel }) {
    const resolution = Math.min(1, 768 / Math.max(width, height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * resolution)), Math.max(1, Math.round(height * resolution)));
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    const reflection = ctx.createImageData(canvas.width, canvas.height);
    for (let j = 0; j < canvas.height; j++) {
        const y = ((j + .5) / canvas.height - .5) * height;
        for (let i = 0; i < canvas.width; i++) {
            const x = ((i + .5) / canvas.width - .5) * width;
            const radius = y < 0 ? corners[x < 0 ? 0 : 1] : corners[x < 0 ? 3 : 2];
            const dx = Math.abs(x) - width / 2 + radius;
            const dy = Math.abs(y) - height / 2 + radius;
            const cornerDistance = Math.hypot(Math.max(0, dx), Math.max(0, dy));
            const depth = radius - cornerDistance - Math.min(0, Math.max(dx, dy));
            const t = Math.min(1, Math.max(0, depth / bevel));
            const bend = (1 - t) ** 2;
            const nx = cornerDistance ? Math.max(0, dx) / cornerDistance : Number(dx >= dy);
            const ny = cornerDistance ? Math.max(0, dy) / cornerDistance : Number(dy > dx);
            const wave = .18 * t;
            const offset = (j * canvas.width + i) * 4;
            pixels.data[offset] = 128 + 122 * (-Math.sign(x) * nx * bend + wave * Math.sin(x / 28 + Math.cos(y / 35)));
            pixels.data[offset + 1] = 128 + 122 * (-Math.sign(y) * ny * bend + wave * Math.cos(y / 31 + Math.sin(x / 43)));
            pixels.data[offset + 3] = 255;
            reflection.data[offset + 3] = Math.round(255 * bend);
        }
    }
    ctx.putImageData(pixels, 0, 0);
    const reader = new FileReaderSync();
    const displacement = canvas.convertToBlob();
    ctx.putImageData(reflection, 0, 0);
    return Promise.all([displacement, canvas.convertToBlob()]).then(blobs => ({
        displacement: reader.readAsDataURL(blobs[0]),
        reflection: reader.readAsDataURL(blobs[1]),
    }));
}
