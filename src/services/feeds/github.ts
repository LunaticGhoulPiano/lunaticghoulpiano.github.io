import type { SnapshotMap } from "../../data/github/schema.ts";
import { activityDefinitions, eventCategories } from "../../config/github.ts";
import { site } from "../../config/site.ts";
import { getGithubData } from "../../data/github/store.ts";

const activityCategories = Object.keys(activityDefinitions) as (keyof typeof activityDefinitions)[];

export function getGithubFeed() {
    const { activity, contributions } = getGithubData();
    return {
        ...githubActivity(activity, contributions),
        hasActivity: activity !== null,
    };
}

type Category = Exclude<(typeof activityCategories)[number], "all"> | "star";
type Event = SnapshotMap["activity"]["data"][number];

interface PublicActivityEntry {
    id: string;
    category: Category;
    type: Event["type"] | "Commit";
    occurredAt: string;
    quantity: number;
    repository: string;
    url: string;
}

interface PrivateActivityEntry {
    id: string;
    category: "private_repo_contribution";
    type: "PrivateContribution";
    occurredAt: string;
    quantity: number;
}

export type ActivityEntry = PublicActivityEntry | PrivateActivityEntry;

function compareActivity(a: ActivityEntry, b: ActivityEntry) {
    const day = b.occurredAt.slice(0, 10).localeCompare(a.occurredAt.slice(0, 10));
    if (day !== 0) return day;
    const aDaily = a.occurredAt.length === 10;
    const bDaily = b.occurredAt.length === 10;
    // Daily aggregates have no event time; place them after timed events on the same day.
    if (aDaily !== bDaily) return aDaily ? 1 : -1;
    return Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id);
}

function commitUrl(repositoryUrl: string, date: string) {
    const parameters = new URLSearchParams({
        author: site.handle,
        since: `${date}T00:00:00Z`,
        until: `${date}T23:59:59Z`,
    });
    return `${repositoryUrl}/commits?${parameters}`;
}

export function activityMetadata(...snapshots: (SnapshotMap["activity"] | SnapshotMap["contributions"] | null)[]) {
    const available = snapshots.filter((snapshot) => snapshot !== null);
    if (available.length === 0) return {
        period: null,
        notice: null,
    };
    const earliest = (dates: string[]) => dates.reduce((a, b) => Date.parse(a) < Date.parse(b) ? a : b);
    const latest = (dates: string[]) => dates.reduce((a, b) => Date.parse(a) > Date.parse(b) ? a : b);
    return {
        period: {
            from: earliest(available.map((snapshot) => snapshot.period.from)),
            to: latest(available.map((snapshot) => snapshot.period.to)),
        },
        notice: {
            lastSuccessfulFetchAt: earliest(available.map((snapshot) => snapshot.lastSuccessfulFetchAt)),
            coverage: available.some((snapshot) => snapshot.coverage === "partial") ? "partial" as const : "complete" as const,
        },
    };
}


export function githubActivity(
    activity: SnapshotMap["activity"] | null,
    contributions: SnapshotMap["contributions"] | null,
) {
    const entries: ActivityEntry[] = [
        ...(contributions?.data.commitDays ?? []).map((day) => ({
            id: `commit:${day.repository}:${day.date}`,
            category: "commit" as const,
            type: "Commit" as const,
            occurredAt: day.date,
            quantity: day.count,
            repository: day.repository,
            url: commitUrl(day.url, day.date),
        })),
        ...(contributions?.data.privateContributionDays ?? []).map((day) => ({
            id: `private_repo_contribution:${day.date}`,
            category: "private_repo_contribution" as const,
            type: "PrivateContribution" as const,
            occurredAt: day.date,
            quantity: day.count,
        })),
        ...(activity?.data ?? []).map((event) => ({
            ...event,
            quantity: 1,
            category: eventCategories[event.type],
        })),
    ].sort(compareActivity);
    const sources = {
        all: activity !== null || contributions !== null,
        activity: activity !== null,
        commitDays: contributions?.data.commitDays !== undefined,
        privateContributionDays: contributions?.data.privateContributionDays !== undefined,
    };
    const categories = activityCategories.map((key) => {
        const items = key === "all" ? entries : entries.filter((entry) => entry.category === key);
        const definition = activityDefinitions[key];
        const available = sources[definition.source];
        return {
            key,
            items,
            available,
            count: definition.countMode === "quantity" ? items.reduce((sum, item) => sum + item.quantity, 0) : items.length,
        };
    });
    return {
        ...activityMetadata(activity, contributions),
        entries,
        categories,
    };
}
