import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { youtubeChannel, youtubePolicy } from "../../config/youtube.ts";
import { youtubeSnapshotSchema } from "./schema.ts";

export function getYoutubeData(directory = snapshotDirectory) {
    try {
        const parsed = youtubeSnapshotSchema.safeParse(JSON.parse(readFileSync(join(directory, youtubePolicy.snapshotFilename), "utf8")));
        if (parsed.success && parsed.data.handle.toLowerCase() === youtubeChannel.handle.toLowerCase()) return parsed.data;
        console.warn("[YouTube] Invalid snapshot or mismatched channel.");
    }
    catch (error) {
        if (error.code !== "ENOENT") console.warn("[YouTube] Cannot read the saved snapshot.");
    }
    return null;
}
