import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { writeSnapshot } from "../../scripts/snapshots/files.mjs";

test("snapshot validation sees staged data while failure retains the previous file and removes staging", async () => {
    await withTemporaryDirectory(async (root) => {
        const filename = "snapshot.json";
        await writeSnapshot(root, filename, { version: 1 });
        let staging;
        const stages = [];
        await assert.rejects(writeSnapshot(root, filename, { version: 2 }, {
            onStage: (stage) => stages.push(stage),
            validate: async (directory) => {
                staging = directory;
                assert.deepEqual(JSON.parse(await readFile(join(directory, filename), "utf8")), { version: 2 });
                assert.deepEqual(JSON.parse(await readFile(join(root, filename), "utf8")), { version: 1 });
                throw new Error("Fixture validation failure");
            },
        }), /Fixture validation failure/);
        assert.deepEqual(stages, ["staging", "validation"]);
        assert.deepEqual(JSON.parse(await readFile(join(root, filename), "utf8")), { version: 1 });
        await assert.rejects(access(staging), { code: "ENOENT" });
        stages.length = 0;
        await writeSnapshot(root, filename, { version: 3 }, { onStage: (stage) => stages.push(stage) });
        assert.deepEqual(stages, ["staging", "validation", "saving"]);
        assert.deepEqual(JSON.parse(await readFile(join(root, filename), "utf8")), { version: 3 });
    });
});
