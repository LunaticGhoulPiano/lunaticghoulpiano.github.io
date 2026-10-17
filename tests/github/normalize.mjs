import { fixtureFetch, fixtureLogin, fixtureNow, repository as graphRepository } from "./fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { GithubClient } from "../../scripts/github/client.ts";
import { fetchGithubSnapshots, snapshotPeriod } from "../../scripts/github/fetch.ts";
import {
    normalizeRepositories,
    normalizeContributions,
    normalizeEvents,
} from "../../scripts/github/normalize.ts";
import { contributionsSnapshotSchema, activitySnapshotSchema } from "../../src/data/github/schema.ts";

const now = fixtureNow;
const period = snapshotPeriod(now);
const login = fixtureLogin;

function apiRepository(id, overrides = {}) {
    return {
        id,
        name: `repo${id}`,
        full_name: `${login}/repo${id}`,
        html_url: `https://github.com/${login}/repo${id}`,
        private: false,
        visibility: "public",
        owner: {
            login,
        },
        description: null,
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        fork: false,
        updated_at: "2026-10-16T00:00:00Z",
        ...overrides,
    };
}

function commits(id, counts, visibility = "PUBLIC") {
    return {
        repository: graphRepository(id, visibility),
        contributions: {
            totalCount: counts.reduce((sum, count) => sum + count, 0),
            pageInfo: {
                hasNextPage: false,
                endCursor: null,
            },
            nodes: counts.map((commitCount, index) => ({
                occurredAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                commitCount,
                isRestricted: false,
            })),
        },
    };
}

function contribution(id, visibility = "PUBLIC") {
    return {
        occurredAt: "2026-10-03T12:00:00Z",
        isRestricted: false,
        resource: {
            id,
            repository: graphRepository("other_project", visibility),
        },
    };
}

test("repositories include forks, exclude private/internal/other owners, deduplicate and sort", () => {
    const result = normalizeRepositories(
        [
            apiRepository(2),
            apiRepository(1),
            apiRepository(2),
            apiRepository(3, {
                fork: true,
                updated_at: "2026-10-17T00:00:00Z",
            }),
            apiRepository(4, {
                private: true,
            }),
            apiRepository(5, {
                visibility: "internal",
            }),
            apiRepository(6, {
                owner: {
                    login: "someone_else",
                },
            }),
        ],
        login,
    );
    assert.deepEqual(
        result.map((repo) => repo.id),
        [3, 1, 2],
    );
    assert.equal(result[0].fork, true);
    assert.equal("owner" in result[0], false);
    assert.deepEqual(normalizeRepositories([], login), []);
});

test("contributions count commits, not daily nodes, and exclude private totals", () => {
    const result = normalizeContributions(
        [commits("public_repo", [3, 4]), commits("private_repo", [100], "PRIVATE")],
        {
            issues: [
                contribution("issue1"),
                contribution("issue1"),
                contribution("private_issue", "PRIVATE"),
            ],
            pullRequests: [contribution("pr1")],
            reviews: [contribution("review1")],
        },
        period,
    );
    assert.equal(result.data.commits, 7);
    assert.equal(result.data.repositories, 1);
    assert.equal(result.data.issues, 1);
    assert.equal(result.data.pullRequests, 1);
    assert.equal(result.data.reviews, 1);
    assert.equal(
        result.data.calendar.reduce((sum, day) => sum + day.count, 0),
        10,
    );
    assert.equal(result.coverage, "complete");
    assert.equal(JSON.stringify(result).includes("private_repo"), false);
    contributionsSnapshotSchema.parse({
        schemaVersion: 1,
        source: "github",
        visibility: "public",
        dataset: "contributions",
        lastSuccessfulFetchAt: now.toISOString(),
        period,
        ...result,
    });
});

test("truncated or inconsistent daily contributions are explicitly partial", () => {
    const group = commits("public_repo", [2]);
    group.contributions.totalCount = 7;
    const result = normalizeContributions(
        [group],
        {
            issues: [],
            pullRequests: [],
            reviews: [],
        },
        period,
    );
    assert.equal(result.coverage, "partial");
    assert.equal(result.data.commits, 7);
});

test("events enforce the public window and whitelist fields without counting pushes as commits", () => {
    const event = {
        id: "1",
        type: "PushEvent",
        public: true,
        created_at: "2026-10-01T00:00:00Z",
        repo: {
            name: "another_owner/public_repo",
        },
        payload: {
            email: "must_not_be_saved@example.com",
        },
    };
    const result = normalizeEvents(
        [
            event,
            event,
            {
                ...event,
                id: "2",
                public: false,
            },
            {
                ...event,
                id: "3",
                created_at: "2026-01-01T00:00:00Z",
            },
        ],
        period,
    );
    assert.equal(result.length, 1);
    assert.equal("payload" in result[0], false);
    assert.equal("commits" in result[0], false);
});

test("invalid calendar days fail and equivalent timestamp offsets normalize before comparison", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch());
    const { snapshots } = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, {}, fixtureNow);
    const valid = structuredClone(snapshots.contributions);
    valid.period = {
        from: "2026-02-01T00:00:00Z",
        to: fixtureNow.toISOString(),
    };
    assert.equal(contributionsSnapshotSchema.safeParse(valid).success, true);
    const invalid = structuredClone(valid);
    invalid.data.calendar[0].date = "2026-02-30";
    const result = contributionsSnapshotSchema.safeParse(invalid);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "data.calendar.0.date"));
    const activity = activitySnapshotSchema.parse({
        ...snapshots.activity,
        period: {
            from: "2026-10-01T00:00:00Z",
            to: "2026-10-01T01:00:00Z",
        },
        data: [{
            id: "offset",
            type: "WatchEvent",
            occurredAt: "2026-10-01T08:30:00+08:00",
            repository: "example/repo",
            url: "https://github.com/example/repo",
        }],
    });
    assert.equal(activity.data[0].occurredAt, "2026-10-01T00:30:00.000Z");
});

test("event details preserve public targets while discarding unrelated payload fields and URLs", () => {
    const period = {
        from: "2026-10-01T00:00:00Z",
        to: fixtureNow.toISOString(),
    };
    const event = {
        id: "pr",
        type: "PullRequestEvent",
        public: true,
        created_at: "2026-10-03T12:00:00Z",
        repo: {
            name: "example/repo",
        },
        payload: {
            action: "opened",
            pull_request: {
                html_url: "https://github.com/example/repo/pull/7",
                title: "Public change",
                body: "unneeded_payload",
            },
            email: "unneeded_email",
        },
    };
    const [result] = normalizeEvents([event], period);
    assert.equal(result.url, event.payload.pull_request.html_url);
    assert.equal(result.title, "Public change");
    assert.equal(result.action, "opened");
    assert.doesNotMatch(JSON.stringify(result), /unneeded_/);
    event.payload.pull_request.html_url = "https://github.com/unrelated/repo/pull/7";
    assert.equal(normalizeEvents([event], period)[0].url, "https://github.com/example/repo");
});
