import { mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { youtubePolicy } from "../../src/config/youtube.ts";
import { mymusic5Policy } from "../../src/config/mymusic5.ts";
import { getYoutubeData } from "../../src/data/youtube/store.mjs";
import { getMymusic5Data } from "../../src/data/mymusic5/store.mjs";
import { runYoutubeRefresh } from "../youtube/update.mjs";
import { runMymusic5Refresh } from "../mymusic5/update.mjs";
import { createTemporaryDirectory, removeTemporaryDirectory } from "../temp_dir.mjs";

async function restoreSnapshot(filename, snapshot, outputDirectory) {
    const stage = await createTemporaryDirectory("snapshot_restore_");
    try {
        await writeFile(join(stage, filename), `${JSON.stringify(snapshot, null, 4)}\n`, "utf8");
        await mkdir(outputDirectory, { recursive: true });
        await rename(join(stage, filename), join(outputDirectory, filename));
    }
    finally {
        await removeTemporaryDirectory(stage);
    }
}

export async function runMediaRefresh({
    previousDirectory = process.env.SNAPSHOT_RESTORE_DIR,
    outputDirectory = snapshotDirectory,
    now = new Date(),
    request = fetch,
    youtubeKey,
} = {}) {
    const options = { outputDirectory, now, request };
    const sources = [
        {
            name: "YouTube",
            filename: youtubePolicy.snapshotFilename,
            load: getYoutubeData,
            refresh: () => runYoutubeRefresh({ ...options, key: youtubeKey }),
        },
        {
            name: "MyMusic5",
            filename: mymusic5Policy.snapshotFilename,
            load: getMymusic5Data,
            refresh: () => runMymusic5Refresh(options),
        },
    ];
    const report = { updated: [], reused: [] };
    for (const source of sources) {
        const current = source.load(outputDirectory);
        const previous = previousDirectory ? source.load(previousDirectory) : null;
        const fallback = [current, previous]
            .filter((snapshot) => snapshot && Date.parse(snapshot.lastSuccessfulFetchAt) <= now.valueOf())
            .sort((a, b) => Date.parse(b.lastSuccessfulFetchAt) - Date.parse(a.lastSuccessfulFetchAt))[0];
        if (fallback && fallback !== current) await restoreSnapshot(source.filename, fallback, outputDirectory);
        try {
            await source.refresh();
            report.updated.push(source.name);
        }
        catch (error) {
            if (! fallback) {
                throw new Error(`[${source.name}] Refresh failed and no valid cached snapshot is available.`, { cause: error });
            }
            console.warn(`[${source.name}] Refresh failed; keeping the snapshot from ${fallback.lastSuccessfulFetchAt}.`);
            report.reused.push(source.name);
        }
    }
    return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await runMediaRefresh();
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : "Media snapshot refresh failed.");
        process.exitCode = 1;
    }
}
