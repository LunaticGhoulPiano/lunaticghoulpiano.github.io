import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { githubPolicy } from "../../config/github.ts";

/** @returns {unknown} */
export function readSnapshotBundle(
    directory = process.env.GITHUB_SNAPSHOT_DIR ?? snapshotDirectory,
) {
    const filename = join(directory, githubPolicy.snapshotFilename);
    try {
        return JSON.parse(readFileSync(filename, "utf8"));
    } catch (error) {
        console.warn(`[GitHub] Cannot read snapshot bundle at ${filename}: ${error instanceof SyntaxError ? "invalid JSON" : error.code ?? "read failure"}.`);
        return null;
    }
}
