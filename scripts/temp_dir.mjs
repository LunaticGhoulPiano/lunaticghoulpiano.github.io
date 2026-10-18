import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { temporaryRoot } from "./runtime.mjs";

export async function createTemporaryDirectory(prefix = "validation_") {
    if (! /^[a-z_]+$/.test(prefix)) throw new Error("Invalid temporary directory prefix.");
    for (let attempt = 0; attempt < 2; attempt++) {
        await mkdir(temporaryRoot, {
            recursive: true,
        });
        try {
            return await mkdtemp(join(temporaryRoot, prefix));
        }
        catch (error) {
            // Another test process may remove the empty parent between mkdir and mkdtemp.
            if (error.code !== "ENOENT" || attempt > 0) throw error;
        }
    }
}

export async function removeTemporaryDirectory(directory) {
    const path = resolve(directory);
    if (! path.startsWith(`${temporaryRoot}${sep}`)) throw new Error("Invalid temporary directory.");
    await rm(path, {
        recursive: true,
        force: true,
    });
    await rmdir(temporaryRoot).catch((error) => {
        if (! ["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    });
}

export async function withTemporaryDirectory(run) {
    const directory = await createTemporaryDirectory();
    try {
        return await run(directory);
    }
    finally {
        await removeTemporaryDirectory(directory);
    }
}
