import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { writeSnapshot } from "../../scripts/snapshots/files.mjs";
import { readSnapshotFile } from "../../src/data/snapshot_file.mjs";

test("an absent snapshot on a clean checkout is optional, but corrupt snapshots are reported", async () => {
    await withTemporaryDirectory(async (root) => {
        const path = join(root, "snapshot.json");
        const errors = [];
        const read = () => readSnapshotFile(path, { parse: (value) => value, onError: (error) => errors.push(error) });
        assert.equal(read(), null);
        assert.equal(errors.length, 0);
        await writeFile(path, "{");
        assert.equal(read(), null);
        assert.equal(errors.length, 1);
        assert.ok(errors[0] instanceof SyntaxError);
    });
});

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
