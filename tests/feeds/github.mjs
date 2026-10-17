import test from "node:test";
import assert from "node:assert/strict";
import { githubActivity, activityMetadata } from "../../src/services/feeds/github.ts";
import { fetchGithubSnapshots } from "../../scripts/github/fetch.ts";
import { GithubClient } from "../../scripts/github/client.ts";
import { contributionsSnapshotSchema } from "../../src/data/github/schema.ts";
import { fixtureFetch, fixtureLogin, fixtureNow } from "../github/fixture.mjs";

test("activity categories preserve event identity and never substitute pushes for commits", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch());
    const { snapshots } = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, {}, fixtureNow);
    const activity = {
        ...snapshots.activity,
        data: [
            {
                id: "push_1",
                type: "PushEvent",
                occurredAt: "2026-10-03T12:00:00Z",
                repository: "example/public_repo",
                url: "https://github.com/example/public_repo",
            },
            {
                id: "star_1",
                type: "WatchEvent",
                occurredAt: "2026-10-04T12:00:00Z",
                repository: "example/another_repo",
                url: "https://github.com/example/another_repo",
            },
        ],
    };
    const result = githubActivity(activity, snapshots.contributions);
    const commits = result.categories.find((category) => category.key === "commit");
    assert.equal(commits.count, 7);
    assert.equal(commits.items.length, 2);
    const privateContributions = result.categories.find((category) => category.key === "private_repo_contribution");
    assert.equal(privateContributions.count, 82);
    assert.deepEqual(privateContributions.items.map((entry) => entry.occurredAt), ["2026-10-03", "2026-10-01"]);
    assert.ok(privateContributions.items.every((entry) => ! ("url" in entry) && ! ("repository" in entry)));
    assert.equal(result.categories.find((category) => category.key === "push").count, 1);
    assert.equal(result.entries[0].type, "WatchEvent");
    assert.deepEqual(result.categories.map((category) => category.key), [
        "all", "push", "pull_request", "commit", "private_repo_contribution", "issue", "repository", "review", "release", "discussion",
    ]);
    const all = result.categories.find((category) => category.key === "all");
    assert.equal(all.count, 6);
    assert.deepEqual(all.items.map((entry) => entry.type), ["WatchEvent", "PushEvent", "PrivateContribution", "Commit", "Commit", "PrivateContribution"]);
    assert.doesNotMatch(JSON.stringify(result), /private_project/);

    const withoutContributions = githubActivity(activity, null);
    assert.equal(withoutContributions.entries.length, 2);
    assert.equal(withoutContributions.categories.find((category) => category.key === "commit").available, false);
    assert.equal(withoutContributions.categories.find((category) => category.key === "private_repo_contribution").available, false);
    assert.equal(withoutContributions.categories[0].available, true);
    const commitsOnly = githubActivity(null, snapshots.contributions);
    assert.equal(commitsOnly.categories[0].available, true);
    assert.equal(commitsOnly.categories[0].items.length, 4);
    assert.equal(githubActivity(null, null).categories[0].available, false);
    const noPrivate = structuredClone(snapshots.contributions);
    noPrivate.data.privateContributions = 0;
    noPrivate.data.privateContributionDays = [];
    assert.equal(githubActivity(activity, noPrivate).categories.find((category) => category.key === "private_repo_contribution").count, 0);
    delete noPrivate.data.privateContributionDays;
    assert.equal(githubActivity(activity, noPrivate).categories.find((category) => category.key === "private_repo_contribution").available, false);
    const legacy = structuredClone(snapshots.contributions);
    delete legacy.data.commitDays;
    assert.equal(contributionsSnapshotSchema.safeParse(legacy).success, true);
    assert.equal(githubActivity(activity, legacy).categories.find((category) => category.key === "commit").available, false);

    const invalid = structuredClone(snapshots.contributions);
    invalid.data.commitDays[0].count += 1;
    assert.equal(contributionsSnapshotSchema.safeParse(invalid).success, false);
    const invalidPrivate = structuredClone(snapshots.contributions);
    invalidPrivate.data.privateContributionDays[0].count += 1;
    assert.equal(contributionsSnapshotSchema.safeParse(invalidPrivate).success, false);
});

test("combined activity metadata covers both source periods and never overstates freshness", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch());
    const { snapshots } = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, {}, fixtureNow);
    const activity = structuredClone(snapshots.activity);
    activity.period.to = new Date(fixtureNow.valueOf() + 3600000).toISOString();
    activity.lastSuccessfulFetchAt = activity.period.to;
    const metadata = activityMetadata(activity, snapshots.contributions);
    assert.equal(metadata.period.to, activity.period.to);
    assert.equal(metadata.notice.lastSuccessfulFetchAt, snapshots.contributions.lastSuccessfulFetchAt);
    assert.ok(activityMetadata(null, snapshots.contributions).notice);
    assert.equal(activityMetadata(null, null).notice, null);
});
