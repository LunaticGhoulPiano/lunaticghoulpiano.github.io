import { site } from "../../src/config/site.ts";
import type { eventCategories } from "../../src/config/github.ts";

export const contributionSources = {
    issues: {
        field: "issueContributions",
        resource: "issue",
        options: ", excludeFirst: false, excludePopular: false",
        label: "Public Issues",
    },
    pullRequests: {
        field: "pullRequestContributions",
        resource: "pullRequest",
        options: ", excludeFirst: false, excludePopular: false",
        label: "Public Pull Requests",
    },
    reviews: {
        field: "pullRequestReviewContributions",
        resource: "pullRequest",
        options: "",
        label: "Public Reviews",
    },
} as const;

export type ContributionKind = keyof typeof contributionSources;
export const contributionKinds = Object.keys(contributionSources) as ContributionKind[];

export const eventResources: Partial<Record<keyof typeof eventCategories, readonly string[]>> = {
    PullRequestEvent: ["pull_request"],
    IssuesEvent: ["issue"],
    IssueCommentEvent: ["comment", "issue"],
    PullRequestReviewEvent: ["review", "pull_request"],
    PullRequestReviewCommentEvent: ["comment", "pull_request"],
    ReleaseEvent: ["release"],
    DiscussionEvent: ["discussion"],
};

export const githubToolPolicy = {
    apiUrl: "https://api.github.com",
    webUrl: "https://github.com",
    userAgent: `${site.handle}-profile`,
    pageSize: 100,
    repositoryPages: 10,
    eventPages: 3,
    contributionPages: 3,
    commitRepositories: 100,
    attempts: 2,
    retryDelayMs: 1000,
    refreshTimeoutMs: 120_000,
    requestTimeoutMs: 15_000,
    graphqlPoints: 100,
    periodDays: 30,
    refreshHours: 6,
} as const;

export const requestBudgets = {
    rest: (1 + githubToolPolicy.repositoryPages + githubToolPolicy.eventPages) * githubToolPolicy.attempts,
    graphql: (2 + contributionKinds.length * githubToolPolicy.contributionPages) * githubToolPolicy.attempts,
};
