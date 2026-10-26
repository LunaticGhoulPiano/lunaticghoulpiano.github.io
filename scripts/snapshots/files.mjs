import { mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createTemporaryDirectory, removeTemporaryDirectory } from "../temp_dir.mjs";

export async function writeSnapshot(outputDirectory, filename, snapshot, {
    validate = async () => {},
    onStage = () => {},
    onCleanupError,
} = {}) {
    onStage("staging");
    const stage = await createTemporaryDirectory("snapshot_");
    try {
        await writeFile(join(stage, filename), `${JSON.stringify(snapshot, null, 4)}\n`, "utf8");
        onStage("validation");
        await validate(stage);
        onStage("saving");
        await mkdir(outputDirectory, { recursive: true });
        await rename(join(stage, filename), join(outputDirectory, filename));
    }
    finally {
        try {
            await removeTemporaryDirectory(stage);
        }
        catch (error) {
            if (! onCleanupError) throw error;
            onCleanupError(error);
        }
    }
}
