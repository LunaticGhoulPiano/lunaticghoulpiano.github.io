import { readFileSync } from "node:fs";

/** @template T
 * @param {string} filename
 * @param {{ parse: (value: unknown) => T, onError: (error: any) => void }} options
 * @returns {T | null}
 */
export function readSnapshotFile(filename, { parse, onError }) {
    try {
        return parse(JSON.parse(readFileSync(filename, "utf8")));
    }
    catch (error) {
        onError(error);
        return null;
    }
}

/** @template T
 * @param {string} filename
 * @param {{ safeParse: (value: unknown) => { success: true, data: T } | { success: false } }} schema
 * @param {(value: T) => boolean} matches
 * @param {{ invalid: string, unreadable: string }} messages
 * @returns {T | null}
 */
export function readValidatedSnapshot(filename, schema, matches, messages) {
    return readSnapshotFile(filename, {
        parse: (value) => {
            const parsed = schema.safeParse(value);
            if (parsed.success && matches(parsed.data)) return parsed.data;
            console.warn(messages.invalid);
            return null;
        },
        onError: (error) => {
            if (error.code !== "ENOENT") console.warn(messages.unreadable);
        },
    });
}
