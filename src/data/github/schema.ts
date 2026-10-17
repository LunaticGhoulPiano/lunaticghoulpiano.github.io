import { z } from "astro/zod";
import { dateSchema } from "../../utils/dates.ts";
import { eventCategories, githubPolicy } from "../../config/github.ts";

export const timestamp = z.iso.datetime({
    offset: true,
}).transform((value) => new Date(value).toISOString());
export const count = z.number().int().nonnegative();
export const githubUrl = z.url().refine((value) => {
    const url = new URL(value);
    return (
        url.protocol === "https:" && url.hostname === "github.com" && ! url.username && ! url.password
    );
}, "Expected a public GitHub URL.");
export const repositoryName = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const periodSchema = z
    .object({
        from: timestamp,
        to: timestamp,
    })
    .refine((value) => Date.parse(value.to) > Date.parse(value.from));

export const repositorySchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    fullName: repositoryName,
    url: githubUrl,
    description: z.string().nullable(),
    language: z.string().nullable(),
    stars: count,
    forks: count,
    fork: z.boolean(),
    updatedAt: timestamp,
});

const common = {
    schemaVersion: z.literal(githubPolicy.schemaVersion),
    source: z.literal("github"),
    visibility: z.literal("public"),
    coverage: z.enum(["complete", "partial"]),
    lastSuccessfulFetchAt: timestamp,
};

const profileSnapshotSchema = z.object({
    ...common,
    dataset: z.literal("profile"),
    data: z.object({
        login: z.string().min(1),
        url: githubUrl,
        followers: count,
        following: count,
        publicRepositories: count,
    }),
});
const repositoriesSnapshotSchema = z.object({
    ...common,
    dataset: z.literal("repositories"),
    data: z.array(repositorySchema),
});

export const contributionsSnapshotSchema = z
    .object({
        ...common,
        dataset: z.literal("contributions"),
        period: periodSchema,
        data: z.object({
            commits: count,
            pullRequests: count,
            issues: count,
            reviews: count,
            privateContributions: count.optional(),
            privateContributionDays: z.array(z.object({
                date: dateSchema,
                count: count.positive(),
            })).optional(),
            repositories: count,
            commitDays: z.array(
                z.object({
                    date: dateSchema,
                    repository: repositoryName,
                    url: githubUrl,
                    count: count.positive(),
                }),
            ).optional(),
            calendar: z.array(
                z.object({
                    date: dateSchema,
                    count,
                }),
            ),
            byRepository: z.array(
                z.object({
                    id: z.string().min(1),
                    name: repositoryName,
                    url: githubUrl,
                    commits: count,
                }),
            ),
            calendarScope: z.literal("public-commits-issues-pull-requests-reviews"),
        }),
    })
    .refine((snapshot) => {
        const data = snapshot.data;
        return (
            new Set(data.byRepository.map((repo) => repo.id)).size === data.byRepository.length
            && data.byRepository.reduce((sum, repo) => sum + repo.commits, 0) === data.commits
            && data.repositories === data.byRepository.filter((repo) => repo.commits > 0).length
            && new Set(data.calendar.map((day) => day.date)).size === data.calendar.length
            && (data.privateContributionDays === undefined
                || (data.privateContributions !== undefined
                    && new Set(data.privateContributionDays.map((day) => day.date)).size === data.privateContributionDays.length
                    && data.privateContributionDays.reduce((sum, day) => sum + day.count, 0) === data.privateContributions
                    && data.privateContributionDays.every((day) =>
                        day.date >= snapshot.period.from.slice(0, 10)
                        && day.date <= snapshot.period.to.slice(0, 10),
                    )))
            && data.calendar.every(
                (day) =>
                    day.date >= snapshot.period.from.slice(0, 10)
                    && day.date <= snapshot.period.to.slice(0, 10),
            )
            && (data.commitDays === undefined
                || (new Set(data.commitDays.map((day) => `${day.repository}:${day.date}`)).size === data.commitDays.length
                    && data.commitDays.every((day) =>
                        day.date >= snapshot.period.from.slice(0, 10)
                        && day.date <= snapshot.period.to.slice(0, 10)
                        && data.byRepository.some((repo) => repo.name === day.repository && repo.url === day.url),
                    )
                    && data.byRepository.every((repo) => {
                        const total = data.commitDays!
                            .filter((day) => day.repository === repo.name)
                            .reduce((sum, day) => sum + day.count, 0);
                        return snapshot.coverage === "complete" ? total === repo.commits : total <= repo.commits;
                    })))
            && (snapshot.coverage === "partial"
                || data.calendar.reduce((sum, day) => sum + day.count, 0)
                    === data.commits + data.issues + data.pullRequests + data.reviews)
        );
    }, "Contribution totals, repository counts and calendar must agree.");

export const eventTypes = Object.keys(eventCategories) as (keyof typeof eventCategories)[];
export const activitySnapshotSchema = z
    .object({
        ...common,
        dataset: z.literal("activity"),
        period: periodSchema,
        data: z.array(
            z.object({
                id: z.string(),
                type: z.enum(eventTypes),
                occurredAt: timestamp,
                repository: repositoryName,
                url: githubUrl,
                title: z.string().optional(),
                action: z.string().optional(),
            }),
        ),
    })
    .refine(
        (snapshot) =>
            new Set(snapshot.data.map((item) => item.id)).size === snapshot.data.length
            && snapshot.data.every(
                (item) =>
                    item.occurredAt >= snapshot.period.from
                    && item.occurredAt <= snapshot.period.to,
            ),
        "Invalid event period or duplicate event.",
    );

export const snapshotSchemas = {
    profile: profileSnapshotSchema,
    repositories: repositoriesSnapshotSchema,
    contributions: contributionsSnapshotSchema,
    activity: activitySnapshotSchema,
};
export type Dataset = keyof typeof snapshotSchemas;
export type SnapshotMap = { [K in Dataset]: z.infer<(typeof snapshotSchemas)[K]> };
export type Repository = z.infer<typeof repositorySchema>;
export type Period = z.infer<typeof periodSchema>;
