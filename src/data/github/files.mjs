import { readSnapshotFile } from "../snapshot_file.mjs";
import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { githubPolicy } from "../../config/github.ts";

/** @returns {unknown} */
export function readSnapshotBundle(
    directory = process.env.GITHUB_SNAPSHOT_DIR ?? snapshotDirectory,
) {
    const filename = join(directory, githubPolicy.snapshotFilename);
    return readSnapshotFile(filename, {
        parse: (value) => value,
        onError: (error) => console.warn(`[GitHub] Cannot read snapshot bundle at ${filename}: ${error instanceof SyntaxError ? "invalid JSON" : error.code ?? "read failure"}.`),
    });
}
