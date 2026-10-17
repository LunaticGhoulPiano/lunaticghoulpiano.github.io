import test from "node:test";
import assert from "node:assert/strict";
import { GithubClient } from "../../scripts/github/client.ts";
import { fetchGithubSnapshots } from "../../scripts/github/fetch.ts";
import { refreshReport } from "../../scripts/github/refresh.ts";
import { renderGithubSummary } from "../../scripts/github/summary.ts";
import { fixtureFetch, fixtureLogin, fixtureNow } from "./fixture.mjs";

test("the English job summary renders metrics and counts actual saves instead of registered datasets", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch());
    const client = new GithubClient("fixture_only");
    const result = await fetchGithubSnapshots(client, fixtureLogin, {}, fixtureNow);
    const report = refreshReport(result.snapshots, ["profile"], client);
    report.execution = {
        status: "succeeded",
        stage: "saving",
        savedDatasets: ["profile", "contributions"],
    };
    const summary = renderGithubSummary(report);
    assert.match(summary, /### GitHub Data Update/);
    assert.match(summary, /Result: Succeeded/);
    assert.match(summary, /Saved snapshots: 2\n/);
    assert.match(summary, /\| contributions \| Reused saved snapshot \|/);
    assert.match(summary, /\| Public Commit Contributions \| 7 \|/);
    assert.match(summary, /\| Public Pull Requests \| 3 \|/);
    assert.match(summary, /\| Public Issues \| 2 \|/);
    assert.match(summary, /\| Public Reviews \| 1 \|/);
    assert.match(summary, /\| Anonymous Private Contributions \| 82 \|/);
    assert.match(summary, /REST requests 3; GraphQL requests 6; GraphQL points 6; retries 0/);
    assert.doesNotMatch(summary, /\p{Script=Han}|fixture_only|private_project/gu);

    report.contributions.data.reviews = 0;
    delete report.contributions.data.privateContributions;
    const unavailable = renderGithubSummary(report);
    assert.match(unavailable, /\| Public Reviews \| 0 \|/);
    assert.match(unavailable, /\| Anonymous Private Contributions \| Unavailable \|/);
});

test("blocked and failed summaries identify the stage without claiming validation or saving succeeded", () => {
    const report = refreshReport({}, [], {
        restRequests: 0,
        graphqlRequests: 0,
        graphqlPoints: 0,
        retries: 0,
    });
    const blocked = renderGithubSummary(report);
    assert.match(blocked, /Result: Blocked\nStage: API fetch\nSaved snapshots: 0/);
    assert.match(blocked, /Contribution data is unavailable/);
    assert.doesNotMatch(blocked, /Validation completed and snapshots were saved/);

    report.execution = {
        status: "failed",
        stage: "validation",
        savedDatasets: [],
    };
    const failed = renderGithubSummary(report);
    assert.match(failed, /Result: Failed\nStage: Snapshot validation\nSaved snapshots: 0/);
    assert.doesNotMatch(failed, /Validation completed and snapshots were saved/);
});
