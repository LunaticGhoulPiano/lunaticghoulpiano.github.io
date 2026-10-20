import { mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { mymusic5Policy } from "../../src/config/mymusic5.ts";
import { hourMilliseconds } from "../../src/config/time.ts";
import { isWithinAge } from "../../src/utils/dates.ts";
import { getMymusic5Data } from "../../src/data/mymusic5/store.mjs";
import { createTemporaryDirectory, removeTemporaryDirectory } from "../temp_dir.mjs";
import { fetchMymusic5Snapshot } from "./fetch.ts";
import { mymusic5ToolPolicy } from "./config.ts";

export const refreshInterval = mymusic5ToolPolicy.refreshHours * hourMilliseconds;

export async function runMymusic5Refresh({
    outputDirectory = snapshotDirectory,
    now = new Date(),
    request = fetch,
} = {}) {
    const result = await fetchMymusic5Snapshot(now, request);
    const stage = await createTemporaryDirectory("music_refresh_");
    try {
        await writeFile(join(stage, mymusic5Policy.snapshotFilename), `${JSON.stringify(result.snapshot, null, 4)}\n`, "utf8");
        await mkdir(outputDirectory, { recursive: true });
        await rename(join(stage, mymusic5Policy.snapshotFilename), join(outputDirectory, mymusic5Policy.snapshotFilename));
    }
    finally {
        await removeTemporaryDirectory(stage);
    }
    console.log(`[MyMusic5] Updated ${result.snapshot.sheets.length} public sheets using ${result.requests} requests.`);
    return result;
}

export async function refreshDevelopmentData() {
    const snapshot = getMymusic5Data();
    if (snapshot && isWithinAge(snapshot.lastSuccessfulFetchAt, Date.now(), refreshInterval)) return;
    await runMymusic5Refresh();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await runMymusic5Refresh();
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : "MyMusic5 refresh failed.");
        process.exitCode = 1;
    }
}
