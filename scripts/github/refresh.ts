import { githubPolicy } from "../../src/config/github.ts";
import { hourMilliseconds } from "../../src/config/time.ts";
import { isWithinAge } from "../../src/utils/dates.ts";
import { snapshotSchemas, type Dataset, type SnapshotMap } from "../../src/data/github/schema.ts";

export const datasets = Object.keys(snapshotSchemas) as Dataset[];

export function snapshotUsable(
    dataset: Dataset,
    snapshot: unknown,
    now = Date.now(),
    maxAge = githubPolicy.maxSnapshotAgeHours * hourMilliseconds,
) {
    const parsed = snapshotSchemas[dataset].safeParse(snapshot);
    if (! parsed.success) return false;
    if (! isWithinAge(parsed.data.lastSuccessfulFetchAt, now, maxAge)) return false;
    if (parsed.data.dataset === "contributions") {
        return parsed.data.data.commitDays !== undefined
            && parsed.data.data.privateContributionDays !== undefined;
    }
    return true;
}

export function mergeSnapshots(current: Partial<SnapshotMap>, restored: Partial<SnapshotMap>) {
    const merged: Partial<SnapshotMap> = {};
    for (const dataset of datasets) {
        const candidates = [current[dataset], restored[dataset]]
            .map((snapshot) => snapshotSchemas[dataset].safeParse(snapshot))
            .filter((result) => result.success)
            .map((result) => result.data)
            .sort((a, b) => Date.parse(b.lastSuccessfulFetchAt) - Date.parse(a.lastSuccessfulFetchAt));
        if (candidates[0]) Object.assign(merged, { [dataset]: candidates[0] });
    }
    return merged;
}

export function refreshReadiness(snapshots: Partial<SnapshotMap>, updated: Dataset[], now = Date.now()) {
    const missing = datasets.filter((dataset) => ! snapshotSchemas[dataset].safeParse(snapshots[dataset]).success);
    const unusable = datasets.filter((dataset) => ! snapshotUsable(dataset, snapshots[dataset], now));
    return {
        ready: unusable.length === 0 && updated.length > 0,
        unusable,
        missing,
        reused: datasets.filter((dataset) => ! missing.includes(dataset) && ! updated.includes(dataset)),
    };
}

interface RefreshUsage {
    restRequests: number;
    graphqlRequests: number;
    graphqlPoints: number;
    retries: number;
}

interface RefreshExecution {
    status: "pending" | "succeeded" | "blocked" | "failed";
    stage: "fetch" | "staging" | "validation" | "saving";
    savedDatasets: Dataset[];
}

export function refreshReport(
    snapshots: Partial<SnapshotMap>,
    updated: Dataset[],
    usage: RefreshUsage,
    now = Date.now(),
) {
    const readiness = refreshReadiness(snapshots, updated, now);
    const rows = datasets.map((dataset) => {
        const status = readiness.missing.includes(dataset)
            ? "missing" as const
            : updated.includes(dataset) ? "updated" as const : "reused" as const;
        const snapshot = status === "missing" ? undefined : snapshots[dataset];
        return {
            dataset,
            status,
            coverage: snapshot?.coverage ?? null,
            lastSuccessfulFetchAt: snapshot?.lastSuccessfulFetchAt ?? null,
        };
    });
    const execution: RefreshExecution = {
        status: readiness.ready ? "pending" : "blocked",
        stage: "fetch",
        savedDatasets: [],
    };
    return {
        readiness,
        datasets: rows,
        contributions: readiness.missing.includes("contributions") ? null : snapshots.contributions ?? null,
        usage: {
            restRequests: usage.restRequests,
            graphqlRequests: usage.graphqlRequests,
            graphqlPoints: usage.graphqlPoints,
            retries: usage.retries,
        },
        execution,
    };
}

export type RefreshReport = ReturnType<typeof refreshReport>;
