import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { youtubeChannel, youtubePolicy } from "../../config/youtube.ts";
import { youtubeSnapshotSchema } from "./schema.ts";
import { readValidatedSnapshot } from "../snapshot_file.mjs";

export function getYoutubeData(directory = snapshotDirectory) {
    return readValidatedSnapshot(join(directory, youtubePolicy.snapshotFilename), youtubeSnapshotSchema,
        (snapshot) => snapshot.handle.toLowerCase() === youtubeChannel.handle.toLowerCase(), {
            invalid: "[YouTube] Invalid snapshot or mismatched channel.",
            unreadable: "[YouTube] Cannot read the saved snapshot.",
        });
}
