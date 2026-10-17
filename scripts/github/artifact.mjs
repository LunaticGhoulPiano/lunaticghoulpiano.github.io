import { githubPolicy } from "../../src/config/github.ts";
import { githubToolPolicy } from "./config.ts";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { temporaryRoot } from "../runtime.mjs";
import { join } from "node:path";

export const restoredSnapshotDirectory = join(temporaryRoot, "github_snapshots");

export async function selectGithubSnapshot({ github, context, core }) {
    core.setOutput("artifact_name", githubToolPolicy.artifactName);
    core.setOutput("snapshot_file", join(snapshotDirectory, githubPolicy.snapshotFilename));
    core.setOutput("restore_directory", restoredSnapshotDirectory);
    const repository = context.payload.repository;
    const { data } = await github.rest.actions.listArtifactsForRepo({
        ...context.repo,
        name: githubToolPolicy.artifactName,
        per_page: githubToolPolicy.pageSize,
    });
    const candidates = data.artifacts
        .filter((artifact) =>
            ! artifact.expired
            && artifact.name === githubToolPolicy.artifactName
            && artifact.workflow_run?.head_branch === repository.default_branch
            && artifact.workflow_run?.head_repository_id === repository.id
            && artifact.workflow_run?.id !== context.runId,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

    for (const artifact of candidates.slice(0, githubToolPolicy.artifactCandidates)) {
        const { data: run } = await github.rest.actions.getWorkflowRun({
            ...context.repo,
            run_id: artifact.workflow_run.id,
        });
        if (run.path.split("@")[0] !== githubToolPolicy.workflow
            || ! githubToolPolicy.workflowEvents.includes(run.event)) continue;
        core.setOutput("artifact_id", String(artifact.id));
        core.setOutput("run_id", String(run.id));
        core.info(`Restoring validated snapshots from workflow run ${run.id}.`);
        return;
    }

    core.info("No retained snapshot artifact found; using checked-out snapshots and fresh API data.");
}
