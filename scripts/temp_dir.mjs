import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { temporaryRoot } from "./runtime.mjs";

export async function createTemporaryDirectory(prefix = "validation_", base = temporaryRoot) {
    if (! /^[a-z_]+$/.test(prefix)) throw new Error("Invalid temporary directory prefix.");
    for (let attempt = 0; attempt < 2; attempt++) {
        await mkdir(base, {
            recursive: true,
        });
        try {
            return await mkdtemp(join(base, prefix));
        }
        catch (error) {
            // Another test process may remove the empty parent between mkdir and mkdtemp.
            if (error.code !== "ENOENT" || attempt > 0) throw error;
        }
    }
}

export async function removeTemporaryDirectory(directory, base = temporaryRoot) {
    const path = resolve(directory);
    if (! path.startsWith(`${resolve(base)}${sep}`)) throw new Error("Invalid temporary directory.");
    await rm(path, {
        recursive: true,
        force: true,
    });
    await rmdir(base).catch((error) => {
        if (! ["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    });
}

export async function withTemporaryDirectory(run, base = temporaryRoot) {
    const directory = await createTemporaryDirectory("validation_", base);
    try {
        return await run(directory);
    }
    finally {
        await removeTemporaryDirectory(directory, base);
    }
}
