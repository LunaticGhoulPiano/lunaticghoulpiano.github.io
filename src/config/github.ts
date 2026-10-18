import { snapshotMaxAgeHours } from "./time.ts";

export const eventCategories = {
    PushEvent: "push",
    PullRequestEvent: "pull_request",
    IssuesEvent: "issue",
    IssueCommentEvent: "issue",
    PullRequestReviewEvent: "review",
    PullRequestReviewCommentEvent: "review",
    CreateEvent: "repository",
    DeleteEvent: "repository",
    ForkEvent: "repository",
    ReleaseEvent: "release",
    WatchEvent: "star",
    PublicEvent: "repository",
    DiscussionEvent: "discussion",
} as const;

export const activityDefinitions = {
    all: {
        source: "all",
        countMode: "entries",
    },
    push: {
        source: "activity",
        countMode: "entries",
    },
    pull_request: {
        source: "activity",
        countMode: "entries",
    },
    commit: {
        source: "commitDays",
        countMode: "quantity",
    },
    private_repo_contribution: {
        source: "privateContributionDays",
        countMode: "quantity",
    },
    issue: {
        source: "activity",
        countMode: "entries",
    },
    repository: {
        source: "activity",
        countMode: "entries",
    },
    review: {
        source: "activity",
        countMode: "entries",
    },
    release: {
        source: "activity",
        countMode: "entries",
    },
    discussion: {
        source: "activity",
        countMode: "entries",
    },
} as const;

export const githubPolicy = {
    maxSnapshotAgeHours: snapshotMaxAgeHours,
    snapshotFilename: "github_snapshots.json",
    schemaVersion: 1,
} as const;
