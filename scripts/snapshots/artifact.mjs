import { snapshotToolPolicy } from "./config.ts";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { temporaryRoot } from "../runtime.mjs";
import { join } from "node:path";

export const restoredSnapshotDirectory = join(temporaryRoot, "snapshots");

export async function selectSnapshots({ github, context, core }) {
    core.setOutput("artifact_name", snapshotToolPolicy.artifactName);
    core.setOutput("snapshot_files", snapshotToolPolicy.filenames.map((filename) => join(snapshotDirectory, filename)).join("\n"));
    core.setOutput("restore_directory", restoredSnapshotDirectory);
    const repository = context.payload.repository;
    for (const name of [snapshotToolPolicy.artifactName, snapshotToolPolicy.legacyArtifactName]) {
        const { data } = await github.rest.actions.listArtifactsForRepo({
            ...context.repo,
            name,
            per_page: snapshotToolPolicy.pageSize,
        });
        const candidates = data.artifacts
            .filter((artifact) =>
                ! artifact.expired
                && artifact.name === name
                && artifact.workflow_run?.head_branch === repository.default_branch
                && artifact.workflow_run?.head_repository_id === repository.id
                && artifact.workflow_run?.id !== context.runId,
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at));

        for (const artifact of candidates.slice(0, snapshotToolPolicy.artifactCandidates)) {
            const { data: run } = await github.rest.actions.getWorkflowRun({
                ...context.repo,
                run_id: artifact.workflow_run.id,
            });
            if (run.path.split("@")[0] !== snapshotToolPolicy.workflow
                || ! snapshotToolPolicy.workflowEvents.includes(run.event)) continue;
            core.setOutput("artifact_id", String(artifact.id));
            core.setOutput("run_id", String(run.id));
            core.info(`Restoring validated snapshots from workflow run ${run.id}.`);
            return;
        }
    }

    core.info("No retained snapshot artifact found; fresh API data is required.");
}
