import { readSnapshotBundle } from "./files.mjs";
import { githubPolicy } from "../../config/github.ts";
import { hourMilliseconds } from "../../config/time.ts";
import { isWithinAge } from "../../utils/dates.ts";
import { snapshotSchemas, type Dataset, type SnapshotMap } from "./schema.ts";

export function snapshotStatus(
    snapshot: {
        lastSuccessfulFetchAt: string;
    } | null,
    now = Date.now(),
) {
    if (! snapshot) return "unavailable" as const;
    return isWithinAge(snapshot.lastSuccessfulFetchAt, now, githubPolicy.maxSnapshotAgeHours * hourMilliseconds) ? "fresh" as const : "stale" as const;
}

export function getGithubData(directory?: string) {
    const bundle = readSnapshotBundle(directory) as Partial<SnapshotMap> | null;
    return Object.fromEntries(Object.entries(snapshotSchemas).map(([dataset, schema]) => {
        const parsed = schema.safeParse(bundle?.[dataset as Dataset]);
        if (bundle && ! parsed.success) console.warn(`[GitHub] Invalid ${dataset} snapshot: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`).join("; ")}`);
        return [dataset, parsed.success ? parsed.data : null];
    })) as { [K in Dataset]: SnapshotMap[K] | null };
}
