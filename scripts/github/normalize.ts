import { contributionKinds, eventResources, githubToolPolicy, type ContributionKind } from "./config.ts";
import { utcDayWindows } from "../../src/utils/dates.ts";
import { z } from "astro/zod";
import {
    count,
    eventTypes,
    githubUrl,
    repositoryName,
    repositorySchema,
    timestamp,
    type Period,
    type Repository,
} from "../../src/data/github/schema.ts";

const apiRepository = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    full_name: repositoryName,
    html_url: githubUrl,
    private: z.boolean(),
    visibility: z.enum(["public", "private", "internal"]),
    owner: z.object({
        login: z.string(),
    }),
    description: z.string().nullable(),
    language: z.string().nullable(),
    stargazers_count: count,
    forks_count: count,
    fork: z.boolean(),
    updated_at: timestamp,
});

function sortRepositories(repositories: Repository[]) {
    return [...new Map(repositories.map((repo) => [repo.id, repo])).values()].sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id - b.id,
    );
}

export function normalizeRepositories(input: unknown, login: string) {
    return sortRepositories(
        z
            .array(apiRepository)
            .parse(input)
            .filter(
                (repo) =>
                    ! repo.private
                    && repo.visibility === "public"
                    && repo.owner.login.toLowerCase() === login.toLowerCase(),
            )
            .map((repo) =>
                repositorySchema.parse({
                    id: repo.id,
                    name: repo.name,
                    fullName: repo.full_name,
                    url: repo.html_url,
                    description: repo.description,
                    language: repo.language,
                    stars: repo.stargazers_count,
                    forks: repo.forks_count,
                    fork: repo.fork,
                    updatedAt: repo.updated_at,
                }),
            ),
    );
}

export function normalizeProfile(input: unknown, login: string) {
    const profile = z
        .object({
            login: z.string(),
            html_url: githubUrl,
            followers: count,
            following: count,
            public_repos: count,
        })
        .parse(input);
    if (profile.login.toLowerCase() !== login.toLowerCase()) throw new Error("Unexpected GitHub account.");
    return {
        login: profile.login,
        url: profile.html_url,
        followers: profile.followers,
        following: profile.following,
        publicRepositories: profile.public_repos,
    };
}

export function normalizeEvents(input: unknown, period: Period) {
    const events = z
        .array(
            z.object({
                id: z.string(),
                type: z.string(),
                public: z.boolean(),
                created_at: timestamp,
                repo: z.object({
                    name: repositoryName,
                }),
                payload: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .parse(input);
    return [
        ...new Map(
            events
                .filter(
                    (event) =>
                        event.public
                        && eventTypes.includes(event.type as (typeof eventTypes)[number])
                        && Date.parse(event.created_at) >= Date.parse(period.from)
                        && Date.parse(event.created_at) <= Date.parse(period.to),
                )
                .map((event) => [
                    event.id,
                    {
                        id: event.id,
                        type: event.type as (typeof eventTypes)[number],
                        occurredAt: new Date(event.created_at).toISOString(),
                        repository: event.repo.name,
                        ...eventDetails(event.type as (typeof eventTypes)[number], event.repo.name, event.payload),
                    },
                ]),
        ).values(),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
}

function eventDetails(type: (typeof eventTypes)[number], repository: string, payload: Record<string, unknown> = {}) {
    const resourceSchema = z.object({
        html_url: githubUrl.optional(),
        title: z.string().optional(),
        name: z.string().optional(),
    });
    const resources = (eventResources[type] ?? []).flatMap((key) => {
        const resource = resourceSchema.safeParse(payload[key]);
        return resource.success ? [resource.data] : [];
    });
    const target = resources.find((resource) => resource.html_url
        && new URL(resource.html_url).pathname.startsWith(`/${repository}/`));
    return {
        url: target?.html_url ?? `${githubToolPolicy.webUrl}/${repository}`,
        title: resources.map((resource) => resource.title ?? resource.name).find(Boolean),
        action: typeof payload.action === "string" ? payload.action : undefined,
    };
}

const graphRepository = z.object({
    id: z.string(),
    nameWithOwner: repositoryName,
    url: githubUrl,
    visibility: z.enum(["PUBLIC", "PRIVATE", "INTERNAL"]),
});
export const pageInfo = z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});
export const commitGroupsSchema = z.array(
    z.object({
        repository: graphRepository,
        contributions: z.object({
            totalCount: count,
            pageInfo,
            nodes: z.array(
                z.object({
                    occurredAt: timestamp,
                    commitCount: count,
                    isRestricted: z.boolean(),
                }),
            ),
        }),
    }),
);
export const contributionNode = z.object({
    occurredAt: timestamp,
    isRestricted: z.boolean(),
    resource: z.object({
        id: z.string(),
        repository: graphRepository,
    }).nullable(),
});
export type ContributionNode = z.infer<typeof contributionNode>;

export function normalizeContributions(
    input: unknown,
    nodes: Record<ContributionKind, ContributionNode[]>,
    period: Period,
    truncated = false,
    privateContributions?: number,
    privateContributionDays?: {
        date: string;
        count: number;
    }[],
) {
    const groups = commitGroupsSchema.parse(input);
    let partial = truncated || groups.length >= githubToolPolicy.commitRepositories;
    const calendar = new Map(utcDayWindows(period).map((day) => [day.date, 0]));
    const commitDays: {
        date: string;
        repository: string;
        url: string;
        count: number;
    }[] = [];
    const addDay = (time: string, value: number) => {
        const day = time.slice(0, 10);
        if (! calendar.has(day)) throw new Error("Contribution outside requested calendar window.");
        calendar.set(day, calendar.get(day)! + value);
    };
    const byRepository = groups
        .filter((group) => group.repository.visibility === "PUBLIC")
        .map((group) => {
            const dates = new Set<string>();
            let dailyTotal = 0;
            for (const node of group.contributions.nodes) {
                if (node.isRestricted) throw new Error("Unexpected restricted contribution in a public repository.");
                const date = node.occurredAt.slice(0, 10);
                if (dates.has(date)) throw new Error("Duplicate daily commit contribution.");
                dates.add(date);
                dailyTotal += node.commitCount;
                addDay(node.occurredAt, node.commitCount);
                if (node.commitCount > 0) {
                    commitDays.push({
                        date,
                        repository: group.repository.nameWithOwner,
                        url: group.repository.url,
                        count: node.commitCount,
                    });
                }
            }
            if (group.contributions.pageInfo.hasNextPage || dailyTotal !== group.contributions.totalCount) partial = true;
            return {
                id: group.repository.id,
                name: group.repository.nameWithOwner,
                url: group.repository.url,
                commits: group.contributions.totalCount,
            };
        })
        .filter((repo) => repo.commits > 0)
        .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
    const totals = Object.fromEntries(contributionKinds.map((kind) => [kind, 0])) as Record<ContributionKind, number>;
    for (const kind of contributionKinds) {
        const seen = new Set<string>();
        for (const raw of nodes[kind]) {
            const node = contributionNode.parse(raw);
            if (node.isRestricted) continue;
            if (! node.resource) throw new Error("Missing public contribution resource.");
            if (node.resource.repository.visibility !== "PUBLIC" || seen.has(node.resource.id)) continue;
            seen.add(node.resource.id);
            addDay(node.occurredAt, 1);
            totals[kind]++;
        }
    }
    return {
        coverage: partial ? ("partial" as const) : ("complete" as const),
        data: {
            ...totals,
            ...(privateContributions === undefined ? {} : {
                privateContributions: count.parse(privateContributions),
            }),
            ...(privateContributionDays === undefined ? {} : {
                privateContributionDays,
            }),
            commits: byRepository.reduce((sum, repo) => sum + repo.commits, 0),
            repositories: byRepository.length,
            byRepository,
            commitDays: commitDays.sort((a, b) => b.date.localeCompare(a.date) || a.repository.localeCompare(b.repository)),
            calendar: [...calendar].map(([date, value]) => ({
                date,
                count: value,
            })),
            calendarScope: "public-commits-issues-pull-requests-reviews" as const,
        },
    };
}
