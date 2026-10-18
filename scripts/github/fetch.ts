import { contributionKinds, contributionSources, githubToolPolicy, type ContributionKind } from "./config.ts";
import { githubPolicy } from "../../src/config/github.ts";
import { dayMilliseconds } from "../../src/config/time.ts";
import { utcDayWindows } from "../../src/utils/dates.ts";
import { z } from "astro/zod";
import { GithubClient } from "./client.ts";
import {
    commitGroupsSchema,
    contributionNode,
    normalizeContributions,
    normalizeEvents,
    normalizeProfile,
    normalizeRepositories,
    pageInfo,
    type ContributionNode,
} from "./normalize.ts";
import {
    count,
    snapshotSchemas,
    type Dataset,
    type Period,
    type SnapshotMap,
} from "../../src/data/github/schema.ts";

const repositoryFields = "id nameWithOwner url visibility";
const rateFields = "rateLimit { cost remaining resetAt }";

export function snapshotPeriod(now = new Date()): Period {
    return {
        from: new Date(now.valueOf() - githubToolPolicy.periodDays * dayMilliseconds).toISOString(),
        to: now.toISOString(),
    };
}

async function fetchPrivateContributionDays(client: GithubClient, login: string, period: Period, total: number) {
    if (total === 0) return [];
    const days = utcDayWindows(period);
    const fields = days.map((day, index) =>
        `privateDay${index}: contributionsCollection(from: ${JSON.stringify(day.from)}, to: ${JSON.stringify(day.to)}) { restrictedContributionsCount }`,
    ).join("\n");
    const { body } = await client.request("/graphql", `query($login: String!) {
        user(login: $login) { ${fields} }
        ${rateFields}
    }`, {
        login,
    });
    const result = z.object({
        user: z.record(z.string(), z.object({
            restrictedContributionsCount: count,
        })),
    }).parse(body);
    const values = days.map((day, index) => {
        const value = result.user[`privateDay${index}`];
        if (! value) throw new Error("Missing daily anonymous contribution count.");
        return {
            date: day.date,
            count: value.restrictedContributionsCount,
        };
    });
    if (values.reduce((sum, day) => sum + day.count, 0) !== total) throw new Error("Anonymous contribution totals changed during refresh; previous snapshot retained.");
    return values.filter((day) => day.count > 0).sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchContributions(client: GithubClient, login: string, period: Period) {
    const variables = {
        login,
        ...period,
    };
    const { body } = await client.request(
        "/graphql",
        `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) { contributionsCollection(from: $from, to: $to) {
            restrictedContributionsCount
            totalRepositoriesWithContributedCommits
            commitContributionsByRepository(maxRepositories: ${githubToolPolicy.commitRepositories}) {
                repository { ${repositoryFields} }
                contributions(first: ${githubToolPolicy.pageSize}) {
                    totalCount pageInfo { hasNextPage endCursor }
                    nodes { occurredAt commitCount isRestricted }
                }
            }
        } } ${rateFields}
    }`,
        variables,
    );
    const summary = z
        .object({
            user: z.object({
                contributionsCollection: z.object({
                    restrictedContributionsCount: count,
                    totalRepositoriesWithContributedCommits: count,
                    commitContributionsByRepository: commitGroupsSchema,
                }),
            }),
        })
        .parse(body).user.contributionsCollection;
    let truncated =
        summary.totalRepositoriesWithContributedCommits
        > summary.commitContributionsByRepository.length;
    const nodes = Object.fromEntries(contributionKinds.map((kind) => [kind, [] as ContributionNode[]])) as Record<ContributionKind, ContributionNode[]>;
    for (const kind of contributionKinds) {
        let cursor: string | null = null;
        let totalCount: number | undefined;
        for (let page = 0; page < githubToolPolicy.contributionPages; page++) {
            const { field, resource, options } = contributionSources[kind];
            const result = await client.request(
                "/graphql",
                `query($login: String!, $from: DateTime!, $to: DateTime!, $cursor: String) {
                user(login: $login) { contributionsCollection(from: $from, to: $to) {
                    entries: ${field}(first: ${githubToolPolicy.pageSize}, after: $cursor${options}) {
                        totalCount pageInfo { hasNextPage endCursor }
                        nodes { occurredAt isRestricted resource: ${resource} { id repository { ${repositoryFields} } } }
                    }
                } } ${rateFields}
            }`,
                {
                    ...variables,
                    cursor,
                },
            );
            const connection = z
                .object({
                    user: z.object({
                        contributionsCollection: z.object({
                            entries: z.object({
                                totalCount: count,
                                pageInfo,
                                nodes: z.array(contributionNode),
                            }),
                        }),
                    }),
                })
                .parse(result.body).user.contributionsCollection.entries;
            if (totalCount !== undefined && totalCount !== connection.totalCount) throw new Error(`GitHub ${kind} changed during pagination; retry on the next refresh.`);
            totalCount = connection.totalCount;
            nodes[kind].push(...connection.nodes);
            if (! connection.pageInfo.hasNextPage) {
                if (nodes[kind].length !== totalCount) throw new Error(`Incomplete GitHub ${kind} pagination.`);
                break;
            }
            if (! connection.pageInfo.endCursor || connection.pageInfo.endCursor === cursor) throw new Error("Invalid contribution pagination.");
            cursor = connection.pageInfo.endCursor;
            if (page === githubToolPolicy.contributionPages - 1) truncated = true;
        }
    }
    return normalizeContributions(
        summary.commitContributionsByRepository,
        nodes,
        period,
        truncated,
        summary.restrictedContributionsCount,
        await fetchPrivateContributionDays(client, login, period, summary.restrictedContributionsCount),
    );
}

export async function fetchGithubSnapshots(
    client: GithubClient,
    login: string,
    previous: Partial<SnapshotMap>,
    now = new Date(),
) {
    const period = snapshotPeriod(now);
    const snapshots: Partial<SnapshotMap> = {
        ...previous,
    };
    const updated: Dataset[] = [];
    const failures: {
        dataset: Dataset;
        reason: string;
    }[] = [];
    const common = {
        schemaVersion: githubPolicy.schemaVersion,
        source: "github" as const,
        visibility: "public" as const,
        lastSuccessfulFetchAt: now.toISOString(),
    };
    async function dataset<K extends Dataset>(name: K, run: () => Promise<unknown>) {
        try {
            const parsed = snapshotSchemas[name].parse(await run());
            Object.assign(snapshots, {
                [name]: parsed,
            });
            updated.push(name);
        }
        catch (error) {
            failures.push({
                dataset: name,
                reason:
                    error instanceof z.ZodError
                        ? "Response validation failed; previous snapshot retained."
                        : error instanceof Error
                        ? error.message
                        : "Refresh failed.",
            });
        }
    }
    await dataset("profile", async () => ({
        ...common,
        dataset: "profile",
        coverage: "complete",
        data: normalizeProfile((await client.request(`/users/${login}`)).body, login),
    }));
    await dataset("repositories", async () => {
        const result = await client.list(
            `/users/${login}/repos?sort=updated&direction=desc&type=owner`,
            githubToolPolicy.repositoryPages,
        );
        if (! result.complete) throw new Error("Repository page limit reached; previous complete snapshot retained.");
        return {
            ...common,
            dataset: "repositories",
            coverage: "complete",
            data: normalizeRepositories(result.items, login),
        };
    });
    await dataset("contributions", async () => ({
        ...common,
        dataset: "contributions",
        period,
        ...(await fetchContributions(client, login, period)),
    }));
    await dataset("activity", async () => {
        const result = await client.list(`/users/${login}/events/public`, githubToolPolicy.eventPages);
        return {
            ...common,
            dataset: "activity",
            coverage: "partial",
            period,
            data: normalizeEvents(result.items, period),
        };
    });
    return {
        snapshots,
        updated,
        failures,
    };
}
