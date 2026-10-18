import { hourMilliseconds, snapshotMaxAgeHours } from "../config/time.ts";
import { isWithinAge } from "../utils/dates.ts";

export function snapshotStatus(snapshot: { lastSuccessfulFetchAt: string } | null, now = Date.now()) {
    if (! snapshot) return "unavailable" as const;
    return isWithinAge(snapshot.lastSuccessfulFetchAt, now, snapshotMaxAgeHours * hourMilliseconds)
        ? "fresh" as const : "stale" as const;
}
