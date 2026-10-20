import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { mymusic5Artist, mymusic5Policy } from "../../config/mymusic5.ts";
import { mymusic5SnapshotSchema } from "./schema.ts";

export function getMymusic5Data(directory = snapshotDirectory) {
    try {
        const parsed = mymusic5SnapshotSchema.safeParse(JSON.parse(readFileSync(join(directory, mymusic5Policy.snapshotFilename), "utf8")));
        if (parsed.success && parsed.data.artistUrl.toLowerCase() === mymusic5Artist.artistUrl.toLowerCase()) return parsed.data;
        console.warn("[MyMusic5] Invalid snapshot or mismatched artist.");
    }
    catch (error) {
        if (error.code !== "ENOENT") console.warn("[MyMusic5] Cannot read the saved snapshot.");
    }
    return null;
}
