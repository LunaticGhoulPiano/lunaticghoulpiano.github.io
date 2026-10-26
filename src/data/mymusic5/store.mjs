import { join } from "node:path";
import { snapshotDirectory } from "../../config/runtime.mjs";
import { mymusic5Artist, mymusic5Policy } from "../../config/mymusic5.ts";
import { mymusic5SnapshotSchema } from "./schema.ts";
import { readValidatedSnapshot } from "../snapshot_file.mjs";

export function getMymusic5Data(directory = snapshotDirectory) {
    return readValidatedSnapshot(join(directory, mymusic5Policy.snapshotFilename), mymusic5SnapshotSchema,
        (snapshot) => snapshot.artistUrl.toLowerCase() === mymusic5Artist.artistUrl.toLowerCase(), {
            invalid: "[MyMusic5] Invalid snapshot or mismatched artist.",
            unreadable: "[MyMusic5] Cannot read the saved snapshot.",
        });
}
