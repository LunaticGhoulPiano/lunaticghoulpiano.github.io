import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withTemporaryDirectory } from "../../scripts/temp_dir.mjs";
import { runMediaRefresh } from "../../scripts/snapshots/update.mjs";
import { selectSnapshots } from "../../scripts/snapshots/artifact.mjs";
import { snapshotToolPolicy } from "../../scripts/snapshots/config.ts";
import { youtubePolicy } from "../../src/config/youtube.ts";
import { mymusic5Policy } from "../../src/config/mymusic5.ts";
import { getYoutubeData } from "../../src/data/youtube/store.mjs";
import { getMymusic5Data } from "../../src/data/mymusic5/store.mjs";
import { fixtureFetch as youtubeFetch, fixtureKey } from "../youtube/fixture.mjs";
import { fixtureFetch as mymusic5Fetch, fixtureNow } from "../mymusic5/fixture.mjs";

const filenames = [youtubePolicy.snapshotFilename, mymusic5Policy.snapshotFilename];
const offline = async () => { throw new Error("Fixture network failure"); };

function mediaRequest() {
    const youtube = youtubeFetch({ count: 12 });
    const mymusic5 = mymusic5Fetch({ count: 13 });
    return (url, options) => new URL(url).hostname === "www.googleapis.com"
        ? youtube(url, options) : mymusic5(url, options);
}

function refresh(outputDirectory, options = {}) {
    return runMediaRefresh({
        outputDirectory,
        previousDirectory: null,
        youtubeKey: fixtureKey,
        now: fixtureNow,
        request: mediaRequest(),
        ...options,
    });
}

test("a checkout without generated files fetches complete media snapshots without repo seed data", async () => {
    await withTemporaryDirectory(async (directory) => {
        const output = join(directory, "generated");
        assert.deepEqual(await refresh(output), { updated: ["YouTube", "MyMusic5"], reused: [] });
        assert.equal(getYoutubeData(output).uploadedVideoIds.length, 12);
        assert.equal(getMymusic5Data(output).sheets.length, 13);
    });
});

test("failed refreshes restore validated artifact data without changing its successful timestamp", async () => {
    await withTemporaryDirectory(async (directory) => {
        const previous = join(directory, "artifact");
        const output = join(directory, "generated");
        await refresh(previous);
        const old = await Promise.all(filenames.map((filename) => readFile(join(previous, filename), "utf8")));
        const result = await refresh(output, {
            previousDirectory: previous,
            now: new Date(fixtureNow.valueOf() + 2 * 86400000),
            request: offline,
        });
        assert.deepEqual(result, { updated: [], reused: ["YouTube", "MyMusic5"] });
        for (const [index, filename] of filenames.entries()) {
            assert.equal(await readFile(join(output, filename), "utf8"), old[index]);
        }
    });
});

test("older artifacts do not replace newer local snapshots on refresh failure", async () => {
    await withTemporaryDirectory(async (directory) => {
        const previous = join(directory, "artifact");
        const output = join(directory, "generated");
        await refresh(previous);
        const later = new Date(fixtureNow.valueOf() + 3600000);
        await refresh(output, { now: later });
        const result = await refresh(output, { previousDirectory: previous, now: later, request: offline });
        assert.deepEqual(result.reused, ["YouTube", "MyMusic5"]);
        assert.equal(getYoutubeData(output).lastSuccessfulFetchAt, later.toISOString());
        assert.equal(getMymusic5Data(output).lastSuccessfulFetchAt, later.toISOString());
    });
});

test("missing, corrupt, foreign and future artifacts cannot hide an initial YouTube refresh failure", async () => {
    await withTemporaryDirectory(async (directory) => {
        const previous = join(directory, "artifact");
        await refresh(previous);
        const path = join(previous, youtubePolicy.snapshotFilename);
        const valid = JSON.parse(await readFile(path, "utf8"));
        const variants = [
            "{invalid",
            JSON.stringify({ ...valid, handle: "@another-channel" }),
            JSON.stringify({ ...valid, lastSuccessfulFetchAt: new Date(fixtureNow.valueOf() + 1).toISOString() }),
        ];
        for (const [index, contents] of variants.entries()) {
            await writeFile(path, contents);
            await assert.rejects(refresh(join(directory, `output-${index}`), {
                previousDirectory: previous,
                request: offline,
            }), /YouTube.*no valid cached snapshot/);
        }
        await assert.rejects(refresh(join(directory, "missing"), { request: offline }), /YouTube.*no valid cached snapshot/);
    });
});

test("a missing or invalid MyMusic5 fallback blocks deployment after a successful YouTube refresh", async () => {
    await withTemporaryDirectory(async (directory) => {
        const previous = join(directory, "artifact");
        await refresh(previous);
        const path = join(previous, mymusic5Policy.snapshotFilename);
        const valid = JSON.parse(await readFile(path, "utf8"));
        const request = (url, options) => new URL(url).hostname === "www.googleapis.com"
            ? youtubeFetch({ count: 2 })(url, options) : offline();
        const variants = [
            "{}",
            JSON.stringify({ ...valid, artistUrl: "another-artist", author: { ...valid.author, artistUrl: "another-artist" } }),
            JSON.stringify({ ...valid, lastSuccessfulFetchAt: new Date(fixtureNow.valueOf() + 1).toISOString() }),
        ];
        for (const [index, contents] of variants.entries()) {
            await writeFile(path, contents);
            await assert.rejects(refresh(join(directory, `output-${index}`), {
                previousDirectory: previous,
                request,
            }), /MyMusic5.*no valid cached snapshot/);
        }
        await assert.rejects(refresh(join(directory, "missing"), { request }), /MyMusic5.*no valid cached snapshot/);
    });
});

test("successful requests replace restored data and advance successful timestamps", async () => {
    await withTemporaryDirectory(async (directory) => {
        const previous = join(directory, "artifact");
        const output = join(directory, "generated");
        await refresh(previous);
        const later = new Date(fixtureNow.valueOf() + 3600000);
        const result = await refresh(output, { previousDirectory: previous, now: later });
        assert.deepEqual(result, { updated: ["YouTube", "MyMusic5"], reused: [] });
        assert.equal(getYoutubeData(output).lastSuccessfulFetchAt, later.toISOString());
        assert.equal(getMymusic5Data(output).lastSuccessfulFetchAt, later.toISOString());
    });
});

test("artifact migration restores legacy GitHub backups only when no current bundle exists", async () => {
    for (const available of [snapshotToolPolicy.artifactName, snapshotToolPolicy.legacyArtifactName, null]) {
        const outputs = {};
        const queried = [];
        await selectSnapshots({
            github: {
                rest: {
                    actions: {
                        listArtifactsForRepo: async ({ name }) => {
                            queried.push(name);
                            return {
                                data: {
                                    artifacts: name === available ? [{
                                        id: 20,
                                        name,
                                        expired: false,
                                        created_at: fixtureNow.toISOString(),
                                        workflow_run: { id: 10, head_branch: "main", head_repository_id: 1 },
                                    }] : [],
                                },
                            };
                        },
                        getWorkflowRun: async () => ({
                            data: { id: 10, path: snapshotToolPolicy.workflow, event: "schedule" },
                        }),
                    },
                },
            },
            context: { runId: 30, repo: {}, payload: { repository: { id: 1, default_branch: "main" } } },
            core: { info: () => {}, setOutput: (key, value) => { outputs[key] = value; } },
        });
        assert.equal(outputs.artifact_name, snapshotToolPolicy.artifactName);
        assert.equal(outputs.artifact_id, available ? "20" : undefined);
        assert.equal(outputs.snapshot_files.split("\n").length, 3);
        assert.deepEqual(queried, available === snapshotToolPolicy.artifactName
            ? [available] : [snapshotToolPolicy.artifactName, snapshotToolPolicy.legacyArtifactName]);
    }
});
