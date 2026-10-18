import { readSnapshotBundle } from "./files.mjs";
import { snapshotSchemas, type Dataset, type SnapshotMap } from "./schema.ts";

export function getGithubData(directory?: string) {
    const bundle = readSnapshotBundle(directory) as Partial<SnapshotMap> | null;
    return Object.fromEntries(Object.entries(snapshotSchemas).map(([dataset, schema]) => {
        const parsed = schema.safeParse(bundle?.[dataset as Dataset]);
        if (bundle && ! parsed.success) console.warn(`[GitHub] Invalid ${dataset} snapshot: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`).join("; ")}`);
        return [dataset, parsed.success ? parsed.data : null];
    })) as { [K in Dataset]: SnapshotMap[K] | null };
}
