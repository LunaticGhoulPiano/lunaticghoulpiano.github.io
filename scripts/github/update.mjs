import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { site } from "../../src/config/site.ts";
import { GithubClient } from "./client.ts";
import { fetchGithubSnapshots } from "./fetch.ts";
import { getGithubData } from "../../src/data/github/store.ts";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { restoredSnapshotDirectory } from "../snapshots/artifact.mjs";
import { removeTemporaryDirectory } from "../temp_dir.mjs";
import { writeSnapshot } from "../snapshots/files.mjs";
import { githubPolicy } from "../../src/config/github.ts";
import { datasets, mergeSnapshots, refreshReport, snapshotUsable } from "./refresh.ts";
import { githubReadToken } from "./environment.mjs";
import { renderGithubSummary } from "./summary.ts";
import { githubToolPolicy } from "./config.ts";
import { hourMilliseconds } from "../../src/config/time.ts";

export const refreshInterval = githubToolPolicy.refreshHours * hourMilliseconds;

export function needsGithubRefresh(snapshots, now = Date.now()) {
    if (snapshots.profile?.data.login.toLowerCase() !== site.handle.toLowerCase()) return true;
    return datasets.some((dataset) => ! snapshotUsable(dataset, snapshots[dataset], now, refreshInterval));
}

export async function refreshDevelopmentData() {
    if (! needsGithubRefresh(getGithubData())) return;
    const token = githubReadToken();
    if (! token) throw new Error("Set WEBPAGE_GITHUB_PROFILE_READONLY in .env to enable automatic GitHub updates.");
    await runGithubRefresh({
        client: new GithubClient(token),
        previousDirectory: null,
        summaryFile: null,
    });
}

function loadSnapshots(directory, login) {
    const snapshots = getGithubData(directory);
    if (snapshots.profile?.data.login.toLowerCase() !== login.toLowerCase()) return {};
    return snapshots;
}

export async function runGithubRefresh({
    client,
    login = site.handle,
    outputDirectory = snapshotDirectory,
    previousDirectory = process.env.GITHUB_PREVIOUS_SNAPSHOT_DIR,
    validate,
    summaryFile = process.env.GITHUB_STEP_SUMMARY,
    now = new Date(),
}) {
    if (! client.token) throw new Error("Missing WEBPAGE_GITHUB_PROFILE_READONLY; no GitHub requests were made.");
    const previous = mergeSnapshots(
        loadSnapshots(outputDirectory, login),
        previousDirectory ? loadSnapshots(previousDirectory, login) : {},
    );
    const result = await fetchGithubSnapshots(client, login, previous, now);
    const report = refreshReport(result.snapshots, result.updated, client, now.valueOf());
    const { readiness, execution } = report;
    for (const failure of result.failures) console.warn(`${failure.dataset}: ${failure.reason}`);
    console.log(JSON.stringify({
        restRequests: client.restRequests,
        graphqlRequests: client.graphqlRequests,
        graphqlPoints: client.graphqlPoints,
        retries: client.retries,
        elapsedMs: Date.now() - client.startedAt,
        updated: result.updated,
        reused: readiness.reused,
    }));
    try {
        if (! readiness.ready) throw new Error(`GitHub refresh cannot be deployed. Missing datasets: ${readiness.missing.join(", ") || "none"}; unusable: ${readiness.unusable.join(", ") || "none"}; updated: ${result.updated.length}.`);
        await writeSnapshot(outputDirectory, githubPolicy.snapshotFilename, result.snapshots, {
            validate,
            onStage: (stage) => { execution.stage = stage; },
            onCleanupError: () => console.warn("Unable to remove the GitHub staging directory."),
        });
        execution.savedDatasets.push(...datasets);
        execution.status = "succeeded";
        console.log("Validated GitHub snapshots updated.");
        return {
            ...result,
            report,
        };
    }
    catch (error) {
        execution.status = readiness.ready ? "failed" : "blocked";
        throw Object.assign(error instanceof Error ? error : new Error("GitHub refresh failed.", {
            cause: error,
        }), {
            report,
        });
    }
    finally {
        if (summaryFile) {
            try {
                await appendFile(summaryFile, renderGithubSummary(report));
            }
            catch {
                console.warn("Unable to write the GitHub Actions summary.");
            }
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await runGithubRefresh({
            client: new GithubClient(githubReadToken()),
        });
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : "GitHub refresh failed.");
        process.exitCode = 1;
    }
    finally {
        const restored = process.env.GITHUB_PREVIOUS_SNAPSHOT_DIR;
        if (restored && resolve(restored) === restoredSnapshotDirectory) {
            await removeTemporaryDirectory(restored).catch(() => {
                console.warn("Unable to remove the restored snapshot directory.");
            });
        }
    }
}
