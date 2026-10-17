import { contributionKinds, contributionSources, type ContributionKind } from "./config.ts";
import type { RefreshReport } from "./refresh.ts";

const contributionLabels = {
    commits: "Public Commit Contributions",
    ...Object.fromEntries(contributionKinds.map((key) => [key, contributionSources[key].label])) as Record<ContributionKind, string>,
    privateContributions: "Anonymous Private Contributions",
};

const datasetLabels = {
    missing: "Missing valid data",
    updated: "Updated",
    reused: "Reused saved snapshot",
};

const stageLabels = {
    fetch: "API fetch",
    staging: "Snapshot staging",
    validation: "Snapshot validation",
    saving: "Snapshot saving",
};

const outcomeLabels = {
    pending: "Pending",
    succeeded: "Succeeded",
    blocked: "Blocked",
    failed: "Failed",
};

export function renderGithubSummary(report: RefreshReport): string {
    const { execution, contributions, usage } = report;
    const rows = report.datasets.map((row) =>
        `| ${row.dataset} | ${datasetLabels[row.status]} | ${row.coverage ?? "Unavailable"} | ${row.lastSuccessfulFetchAt ?? "Unavailable"} |`,
    );
    const metrics = contributions
        ? [
            `Reporting period (UTC): ${contributions.period.from} to ${contributions.period.to}`,
            "",
            "| Contribution Metric | Count |",
            "| --- | ---: |",
            ...Object.entries(contributionLabels).map(([key, label]) =>
                `| ${label} | ${contributions.data[key as keyof typeof contributionLabels] ?? "Unavailable"} |`,
            ),
            "",
            "Public metrics exclude private repositories. Anonymous private contributions have no repository or activity-type details. Reviews use GitHub's contribution count, with the most recent review per pull request.",
        ]
        : ["Contribution data is unavailable."];
    return [
        "### GitHub Data Update",
        "",
        `Result: ${outcomeLabels[execution.status]}`,
        `Stage: ${stageLabels[execution.stage]}`,
        `Saved snapshots: ${execution.savedDatasets.length}`,
        "",
        "| Dataset | Refresh Status | Coverage | Last Fetch (UTC) |",
        "| --- | --- | --- | --- |",
        ...rows,
        "",
        ...metrics,
        "",
        `API usage: REST requests ${usage.restRequests}; GraphQL requests ${usage.graphqlRequests}; GraphQL points ${usage.graphqlPoints}; retries ${usage.retries}.`,
        "",
        execution.status === "succeeded"
            ? "Validation completed and snapshots were saved. Deployment is a separate workflow step."
            : "This refresh has not completed validation and snapshot saving. Deployment must not proceed.",
        "",
    ].join("\n");
}
