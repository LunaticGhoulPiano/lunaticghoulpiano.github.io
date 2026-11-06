export const artifactPolicy = {
    workflow: ".github/workflows/deploy.yml",
    events: ["push", "schedule", "workflow_dispatch"],
    pageSize: 100,
    candidates: 10,
};

// Snapshot backups can survive a failed deploy; deployment baselines cannot.
export async function findWorkflowArtifact({ github, context, name, requireSuccess = false }) {
    const repository = context.payload.repository;
    const { data } = await github.rest.actions.listArtifactsForRepo({
        ...context.repo, name, per_page: artifactPolicy.pageSize,
    });
    const candidates = data.artifacts.filter((artifact) =>
        !artifact.expired && artifact.name === name
        && artifact.workflow_run?.head_branch === repository.default_branch
        && artifact.workflow_run?.head_repository_id === repository.id
        && artifact.workflow_run?.id !== context.runId,
    ).sort((a, b) => b.created_at.localeCompare(a.created_at));

    for (const artifact of candidates.slice(0, artifactPolicy.candidates)) {
        const { data: run } = await github.rest.actions.getWorkflowRun({
            ...context.repo, run_id: artifact.workflow_run.id,
        });
        if (run.path.split("@")[0] !== artifactPolicy.workflow
            || !artifactPolicy.events.includes(run.event)
            || (requireSuccess && run.conclusion !== "success")) continue;
        return artifact;
    }
}
