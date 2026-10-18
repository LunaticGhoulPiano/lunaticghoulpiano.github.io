import { mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { youtubePolicy } from "../../src/config/youtube.ts";
import { hourMilliseconds } from "../../src/config/time.ts";
import { isWithinAge } from "../../src/utils/dates.ts";
import { getYoutubeData } from "../../src/data/youtube/store.mjs";
import { readCredential } from "../environment.mjs";
import { createTemporaryDirectory, removeTemporaryDirectory } from "../temp_dir.mjs";
import { fetchYoutubeSnapshot } from "./fetch.ts";
import { youtubeToolPolicy } from "./config.ts";

export const refreshInterval = youtubeToolPolicy.refreshHours * hourMilliseconds;

export async function runYoutubeRefresh({
    key = readCredential(youtubeToolPolicy.credential),
    outputDirectory = snapshotDirectory,
    now = new Date(),
    request = fetch,
} = {}) {
    const result = await fetchYoutubeSnapshot(key, now, request);
    const stage = await createTemporaryDirectory("youtube_refresh_");
    try {
        await writeFile(join(stage, youtubePolicy.snapshotFilename), `${JSON.stringify(result.snapshot, null, 4)}\n`, "utf8");
        await mkdir(outputDirectory, { recursive: true });
        await rename(join(stage, youtubePolicy.snapshotFilename), join(outputDirectory, youtubePolicy.snapshotFilename));
    }
    finally {
        await removeTemporaryDirectory(stage);
    }
    console.log(`[YouTube] Updated ${result.snapshot.videos.length} public videos using ${result.requests} requests.`);
    return result;
}

export async function refreshDevelopmentData() {
    const snapshot = getYoutubeData();
    if (snapshot && isWithinAge(snapshot.lastSuccessfulFetchAt, Date.now(), refreshInterval)) return;
    await runYoutubeRefresh();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await runYoutubeRefresh();
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : "YouTube refresh failed.");
        process.exitCode = 1;
    }
}
