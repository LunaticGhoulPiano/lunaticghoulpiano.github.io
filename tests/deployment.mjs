import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareDeployment, deploymentFingerprint, selectDeployment } from "../scripts/deployment.mjs";
import { artifactPolicy } from "../scripts/artifacts.mjs";
import { snapshotToolPolicy } from "../scripts/snapshots/config.ts";
import { withTemporaryDirectory } from "../scripts/temp_dir.mjs";

const record = (path, hash = "abc", mode = "100644 blob") => `${mode} ${hash}\t${path}\0`;
const tree = record("src/config/site.ts") + record("README.md");
const snapshot = () => ({
    source: "github", lastSuccessfulFetchAt: "2026-11-07T00:00:00Z",
    period: { from: "2026-10-08T00:00:00Z", to: "2026-11-07T00:00:00Z" },
    data: [{ title: "One", views: 100, updatedAt: "2026-11-01T00:00:00Z" }, { title: "Two", views: 20 }],
});

test("poll timestamps and JSON key order do not deploy, visible data and date changes do", () => {
    const initial = snapshot();
    const expected = deploymentFingerprint(tree, { github: initial });
    const later = snapshot();
    later.lastSuccessfulFetchAt = "2026-11-07T06:00:00Z";
    later.period.from = "2026-10-08T06:00:00Z";
    later.period.to = "2026-11-07T06:00:00Z";
    assert.equal(deploymentFingerprint(tree, { github: later }), expected);
    assert.equal(deploymentFingerprint(tree, { github: Object.fromEntries(Object.entries(later).reverse()) }), expected);
    for (const edit of [
        value => value.data[0].views++,
        value => { value.data[0].title = "New title"; },
        value => { value.data[0].updatedAt = "2026-11-02T00:00:00Z"; },
        value => value.data.pop(),
        value => value.data.reverse(),
        value => { value.period.to = "2026-11-08T00:00:00Z"; },
    ]) {
        const changed = snapshot();
        edit(changed);
        assert.notEqual(deploymentFingerprint(tree, { github: changed }), expected);
    }
});

test("website sources and submodule revisions count; developer notes do not", () => {
    const fingerprint = deploymentFingerprint(tree, {});
    assert.equal(deploymentFingerprint(record("src/config/site.ts") + record("README.md", "changed") + record("TODO.md"), {}), fingerprint);
    for (const path of ["src/pages/index.astro", "public/favicon.svg", "scripts/build.mjs", "pnpm-lock.yaml", ".node-version", artifactPolicy.workflow]) {
        assert.notEqual(deploymentFingerprint(tree + record(path), {}), fingerprint);
    }
    const submodule = "vendor/mymusic5-api";
    assert.notEqual(
        deploymentFingerprint(tree + record(submodule, "old", "160000 commit"), {}),
        deploymentFingerprint(tree + record(submodule, "new", "160000 commit"), {}),
    );
    assert.notEqual(deploymentFingerprint(record("src/removed.ts"), {}), deploymentFingerprint("", {}));
});

test("comparison writes CI outputs and keeps changes pending until the deployed baseline advances", async () => {
    await withTemporaryDirectory(async (directory) => {
        for (const name of snapshotToolPolicy.filenames) await writeFile(join(directory, name), JSON.stringify(snapshot()));
        const previousFile = join(directory, "previous.json");
        const outputFile = join(directory, "candidate.json");
        const actionsOutput = join(directory, "outputs");
        const options = { tree, directory, previousFile, outputFile, actionsOutput };
        assert.equal(await compareDeployment(options), true);
        await writeFile(previousFile, await readFile(outputFile)); // Successful deploy.
        assert.equal(await compareDeployment(options), false);
        const changed = snapshot();
        changed.data[0].views++;
        await writeFile(join(directory, snapshotToolPolicy.filenames[0]), JSON.stringify(changed));
        assert.equal(await compareDeployment(options), true);
        assert.equal(await compareDeployment(options), true); // Failed deploy never replaces baseline.
        await writeFile(previousFile, await readFile(outputFile));
        assert.equal(await compareDeployment(options), false);
        await writeFile(previousFile, "corrupt");
        assert.equal(await compareDeployment(options), true);
        assert.equal(await readFile(actionsOutput, "utf8"), "changed=true\nchanged=false\nchanged=true\nchanged=true\nchanged=false\nchanged=true\n");
    });
});

test("a newer failed or unfinished deployment cannot become the comparison baseline", async () => {
    const outputs = {};
    const inspected = [];
    await selectDeployment({
        context: { runId: 8, repo: {}, payload: { repository: { id: 1, default_branch: "master" } } },
        core: { info() {}, setOutput: (key, value) => { outputs[key] = value; } },
        github: { rest: { actions: {
            listArtifactsForRepo: async ({ name }) => ({ data: { artifacts: [8, 7, 6, 5, 4, 3, 2, 1].map(id => ({
                id, name, expired: id === 7, created_at: `2026-11-0${id}T00:00:00Z`,
                workflow_run: { id, head_repository_id: 1, head_branch: id === 6 ? "feature" : "master" },
            })) } }),
            getWorkflowRun: async ({ run_id }) => {
                inspected.push(run_id);
                return { data: {
                    id: run_id, path: run_id === 5 ? "other.yml" : artifactPolicy.workflow,
                    event: "schedule", conclusion: ({ 4: "failure", 3: null, 2: "success" })[run_id],
                } };
            },
        } } },
    });
    assert.deepEqual(inspected, [5, 4, 3, 2]);
    assert.equal(outputs.artifact_id, "2");
    assert.equal(outputs.run_id, "2");
});
