export function installGlobals(context, environment, writable = false) {
    const previous = new Map(Object.keys(environment).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(environment)) {
        Object.defineProperty(globalThis, key, { configurable: true, writable, value });
    }
    context.after(() => {
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}
