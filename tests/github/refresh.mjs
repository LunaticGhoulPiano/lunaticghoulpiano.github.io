import { dayMilliseconds } from "../../src/config/time.ts";
import { githubPolicy } from "../../src/config/github.ts";
import { githubToolPolicy } from "../../scripts/github/config.ts";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { temporaryRoot } from "../../scripts/runtime.mjs";
import { withTemporaryDirectory as temporaryDirectory } from "../../scripts/temp_dir.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { GithubClient } from "../../scripts/github/client.ts";
import { fetchGithubSnapshots } from "../../scripts/github/fetch.ts";
import { datasets, mergeSnapshots, refreshReadiness, refreshReport } from "../../scripts/github/refresh.ts";
import { runGithubRefresh, needsGithubRefresh, refreshInterval } from "../../scripts/github/update.mjs";
import { selectSnapshots, restoredSnapshotDirectory } from "../../scripts/snapshots/artifact.mjs";
import { snapshotToolPolicy } from "../../scripts/snapshots/config.ts";
import { githubReadToken, validationEnvironment } from "../../scripts/github/environment.mjs";
import { site } from "../../src/config/site.ts";
import { fixtureFetch, fixtureLogin, fixtureNow } from "./fixture.mjs";

async function snapshots(context, options) {
    context.mock.method(globalThis, "fetch", fixtureFetch(options));
    const client = new GithubClient("fixture_only");
    const result = await fetchGithubSnapshots(client, fixtureLogin, {}, fixtureNow);
    return {
        client,
        ...result,
    };
}

async function saveSnapshots(directory, values) {
    await mkdir(directory, {
        recursive: true,
    });
    await writeFile(join(directory, githubPolicy.snapshotFilename), JSON.stringify(values), "utf8");
}

test("API pipeline retrieves all four contribution types, follows cursors and excludes private data", async (context) => {
    const calls = [];
    const result = await snapshots(context, {
        calls,
    });
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.updated, datasets);
    const data = result.snapshots.contributions.data;
    assert.equal(data.privateContributions, 82);
    assert.deepEqual(data.privateContributionDays, [
        {
            date: "2026-10-03",
            count: 80,
        },
        {
            date: "2026-10-01",
            count: 2,
        },
    ]);
    assert.match(calls[0].query, /restrictedContributionsCount/);
    assert.deepEqual([data.commits, data.pullRequests, data.issues, data.reviews], [7, 3, 2, 1]);
    assert.equal(result.snapshots.contributions.coverage, "complete");
    assert.equal(data.calendar.reduce((sum, day) => sum + day.count, 0), 13);
    assert.doesNotMatch(JSON.stringify(result.snapshots), /private_project|hidden_issue|fixture_only/);
    assert.equal(result.client.graphqlRequests, 6);
    assert.equal(result.client.graphqlPoints, 6);
    assert.equal(result.client.restRequests, 3);
    assert.deepEqual(calls[2].variables, {
        login: fixtureLogin,
        ...result.snapshots.contributions.period,
        cursor: "second_page",
    });
    assert.ok(calls[1].query.includes(`issueContributions(first: ${githubToolPolicy.pageSize}, after: $cursor, excludeFirst: false, excludePopular: false)`));
    assert.ok(calls[3].query.includes(`pullRequestContributions(first: ${githubToolPolicy.pageSize}, after: $cursor, excludeFirst: false, excludePopular: false)`));
    assert.ok(calls[4].query.includes(`pullRequestReviewContributions(first: ${githubToolPolicy.pageSize}, after: $cursor)`));
    assert.match(calls[4].query, /resource: pullRequest \{/);
    const report = refreshReport(result.snapshots, result.updated, result.client, fixtureNow.valueOf());
    assert.deepEqual(report.usage, {
        restRequests: 3,
        graphqlRequests: 6,
        graphqlPoints: 6,
        retries: 0,
    });
    assert.ok(report.datasets.every((row) => row.status === "updated"));
    assert.equal(report.contributions.data.commits, 7);
    assert.deepEqual(report.execution, {
        status: "pending",
        stage: "fetch",
        savedDatasets: [],
    });
    assert.doesNotMatch(JSON.stringify(report), /fixture_only/);
});

test("a valid empty contribution period is zero rather than unavailable", async (context) => {
    const result = await snapshots(context, {
        empty: true,
    });
    assert.deepEqual(result.failures, []);
    assert.equal(refreshReadiness(result.snapshots, result.updated, fixtureNow.valueOf()).ready, true);
    const data = result.snapshots.contributions.data;
    assert.equal(data.privateContributions, 0);
    assert.deepEqual(data.privateContributionDays, []);
    assert.deepEqual([data.commits, data.pullRequests, data.issues, data.reviews], [0, 0, 0, 0]);
});

test("restricted nodes without a resource never expose private contribution details", async (context) => {
    const result = await snapshots(context, {
        transformGraphql: (body, query) => {
            if (query.includes("issueContributions")) {
                const entries = body.data.user.contributionsCollection.entries;
                entries.nodes = entries.nodes.map((node) => node.resource.repository.visibility === "PRIVATE" ? {
                    occurredAt: node.occurredAt,
                    isRestricted: true,
                    resource: null,
                } : node);
            }
            return body;
        },
    });
    assert.deepEqual(result.failures, []);
    assert.equal(result.snapshots.contributions.data.issues, 2);
    assert.equal(result.snapshots.contributions.data.privateContributions, 82);
    assert.doesNotMatch(JSON.stringify(result.snapshots), /hidden_issue|private_project/);
});

test("development refresh skips fresh data and updates missing, legacy or six-hour-old snapshots", async (context) => {
    const current = (await snapshots(context)).snapshots;
    current.profile.data.login = site.handle;
    assert.equal(needsGithubRefresh(current, fixtureNow.valueOf()), false);
    assert.equal(needsGithubRefresh(current, fixtureNow.valueOf() + refreshInterval), true);
    assert.equal(needsGithubRefresh({
        ...current,
        contributions: null,
    }, fixtureNow.valueOf()), true);
    delete current.contributions.data.privateContributionDays;
    assert.equal(needsGithubRefresh(current, fixtureNow.valueOf()), true);
});

test("incomplete anonymous daily totals retain the previous contribution snapshot", async (context) => {
    const previous = (await snapshots(context)).snapshots;
    context.mock.method(globalThis, "fetch", fixtureFetch({
        transformGraphql: (body, query) => {
            if (query.includes("privateDay0:")) body.data.user.privateDay0.restrictedContributionsCount += 1;
            return body;
        },
    }));
    const result = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, previous, fixtureNow);
    assert.deepEqual(result.snapshots.contributions, previous.contributions);
    assert.equal(result.updated.includes("contributions"), false);
    assert.equal(result.failures[0].dataset, "contributions");
});

test("development credentials stay in server code and follow environment then local file precedence", async () => {
    await temporaryDirectory(async (directory) => {
        assert.equal(githubReadToken(directory, {}), undefined);
        await writeFile(join(directory, ".env"), 'WEBPAGE_GITHUB_PROFILE_READONLY="fixture_base"\n');
        assert.equal(githubReadToken(directory, {}), "fixture_base");
        await writeFile(join(directory, ".env.local"), "WEBPAGE_GITHUB_PROFILE_READONLY=fixture_local\n");
        assert.equal(githubReadToken(directory, {}), "fixture_local");
        assert.equal(githubReadToken(directory, {
            WEBPAGE_GITHUB_PROFILE_READONLY: "fixture_session",
        }), "fixture_session");
    });
});

test("missing final page records fail contributions instead of publishing reduced totals", async (context) => {
    const result = await snapshots(context, {
        transformGraphql: (body, _query, variables) => {
            if (variables.cursor) body.data.user.contributionsCollection.entries.nodes = [];
            return body;
        },
    });
    assert.equal(result.snapshots.contributions, undefined);
    assert.match(result.failures[0].reason, /Incomplete GitHub issues pagination/);
    assert.deepEqual(refreshReadiness(result.snapshots, result.updated, fixtureNow.valueOf()).missing, ["contributions"]);
});

test("snapshot restoration selects the newest valid dataset without changing its timestamp", async (context) => {
    const result = await snapshots(context);
    const current = structuredClone(result.snapshots);
    current.profile.lastSuccessfulFetchAt = "2026-10-01T00:00:00Z";
    const restored = structuredClone(result.snapshots);
    restored.repositories.data = "invalid";
    const merged = mergeSnapshots(current, restored);
    assert.deepEqual(merged.profile, result.snapshots.profile);
    assert.deepEqual(merged.repositories, current.repositories);
    assert.equal(refreshReadiness(merged, []).ready, false);
});

test("failed contribution refresh reuses the artifact, validates it and saves every registered dataset", async (context) => {
    const previous = (await snapshots(context)).snapshots;
    context.mock.method(globalThis, "fetch", fixtureFetch({
        transformGraphql: () => ({
            data: null,
            errors: [
                {
                    message: "Contribution service unavailable",
                },
            ],
        }),
    }));
    await temporaryDirectory(async (directory) => {
        const restored = join(directory, "restored");
        const output = join(directory, "output");
        const summaryFile = join(directory, "summary.md");
        await saveSnapshots(restored, previous);
        let validated = false;
        const result = await runGithubRefresh({
            client: new GithubClient("fixture_only"),
            login: fixtureLogin,
            now: new Date("2026-10-17T18:00:00Z"),
            outputDirectory: output,
            previousDirectory: restored,
            summaryFile,
            validate: async (stage) => {
                const contribution = JSON.parse(await readFile(join(stage, githubPolicy.snapshotFilename), "utf8")).contributions;
                assert.deepEqual(contribution, previous.contributions);
                assert.deepEqual((await readdir(stage)).sort(), [githubPolicy.snapshotFilename]);
                validated = true;
            },
        });
        assert.equal(validated, true);
        assert.deepEqual(result.updated, ["profile", "repositories", "activity"]);
        assert.deepEqual((await readdir(output)).sort(), [githubPolicy.snapshotFilename]);
        assert.deepEqual(JSON.parse(await readFile(join(output, githubPolicy.snapshotFilename), "utf8")).contributions, previous.contributions);
        assert.deepEqual(result.report.execution, {
            status: "succeeded",
            stage: "saving",
            savedDatasets: datasets,
        });
        assert.deepEqual(result.report.readiness.reused, ["contributions"]);
        assert.deepEqual(result.report.datasets.find((row) => row.dataset === "contributions"), {
            dataset: "contributions",
            status: "reused",
            coverage: previous.contributions.coverage,
            lastSuccessfulFetchAt: previous.contributions.lastSuccessfulFetchAt,
        });
        assert.ok((await readFile(summaryFile, "utf8")).length > 0);
    });
});

test("first-run API failure blocks validation and snapshot writes", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch({
        transformGraphql: () => ({
            data: null,
            errors: [
                {
                    message: "denied",
                },
            ],
        }),
    }));
    await temporaryDirectory(async (directory) => {
        await assert.rejects(runGithubRefresh({
            client: new GithubClient("fixture_only"),
            login: fixtureLogin,
            outputDirectory: directory,
            previousDirectory: null,
            summaryFile: null,
            now: fixtureNow,
            validate: () => assert.fail("Incomplete first run must not build"),
        }), (error) => {
            assert.match(error.message, /Missing datasets: contributions/);
            assert.deepEqual(error.report.readiness.missing, ["contributions"]);
            assert.equal(error.report.contributions, null);
            assert.deepEqual(error.report.execution, {
                status: "blocked",
                stage: "fetch",
                savedDatasets: [],
            });
            return true;
        });
        assert.deepEqual(await readdir(directory), []);
    });
});

test("build failure leaves every saved snapshot untouched and removes staging files", async (context) => {
    const previous = (await snapshots(context)).snapshots;
    await temporaryDirectory(async (directory) => {
        await saveSnapshots(directory, previous);
        await assert.rejects(runGithubRefresh({
            client: new GithubClient("fixture_only"),
            login: fixtureLogin,
            outputDirectory: directory,
            previousDirectory: null,
            summaryFile: null,
            now: new Date("2026-10-17T18:00:00Z"),
            validate: () => {
                throw new Error("Fixture build failure");
            },
        }), (error) => {
            assert.match(error.message, /Fixture build failure/);
            assert.deepEqual(error.report.execution, {
                status: "failed",
                stage: "validation",
                savedDatasets: [],
            });
            return true;
        });
        for (const dataset of datasets) {
            assert.deepEqual(JSON.parse(await readFile(join(directory, githubPolicy.snapshotFilename), "utf8"))[dataset], previous[dataset]);
        }
        assert.equal((await readdir(temporaryRoot)).some((name) => name.startsWith("github_refresh_")), false);
    });
});

test("a save failure cannot publish a subset of the snapshot batch", async (context) => {
    await snapshots(context);
    await temporaryDirectory(async (directory) => {
        await mkdir(join(directory, githubPolicy.snapshotFilename));
        await assert.rejects(runGithubRefresh({
            client: new GithubClient("fixture_only"),
            login: fixtureLogin,
            outputDirectory: directory,
            previousDirectory: null,
            summaryFile: null,
            now: fixtureNow,
            validate: async () => {},
        }), (error) => {
            assert.deepEqual(error.report.execution, {
                status: "failed",
                stage: "saving",
                savedDatasets: [],
            });
            return true;
        });
        assert.deepEqual(await readdir(directory), [githubPolicy.snapshotFilename]);
    });
});

test("an unavailable optional summary does not turn a saved refresh into a failure", async (context) => {
    await snapshots(context);
    const warnings = [];
    context.mock.method(console, "warn", (message) => warnings.push(message));
    await temporaryDirectory(async (directory) => {
        const result = await runGithubRefresh({
            client: new GithubClient("fixture_only"),
            login: fixtureLogin,
            outputDirectory: directory,
            previousDirectory: null,
            summaryFile: directory,
            now: fixtureNow,
            validate: async () => {},
        });
        assert.equal(result.report.execution.status, "succeeded");
        assert.deepEqual(result.report.execution.savedDatasets, datasets);
        assert.ok(warnings.includes("Unable to write the GitHub Actions summary."));
    });
});

test("missing credentials stop before any API request and child environments exclude tokens", async (context) => {
    context.mock.method(globalThis, "fetch", () => assert.fail("Missing credentials must not make requests"));
    await assert.rejects(runGithubRefresh({
        client: new GithubClient(),
        summaryFile: null,
    }), /Missing WEBPAGE_GITHUB_PROFILE_READONLY/);
    const environment = validationEnvironment("fixture_stage", {
        WEBPAGE_GITHUB_PROFILE_READONLY: "fixture_only",
        WEBPAGE_YOUTUBE_PROFILE_READONLY: "fixture_only",
        GH_PROFILE_TOKEN: "fixture_only",
        GITHUB_TOKEN: "fixture_only",
        GH_TOKEN: "fixture_only",
    });
    assert.equal(environment.GITHUB_SNAPSHOT_DIR, "fixture_stage");
    assert.equal(JSON.stringify(environment).includes("fixture_only"), false);
});

test("invalid credentials and GraphQL errors do not retry or expose the token", async (context) => {
    context.mock.method(globalThis, "fetch", async () => new Response(null, {
        status: 401,
    }));
    const client = new GithubClient("fixture_only");
    await assert.rejects(client.request("/users/example"), /invalid or expired/);
    assert.equal(client.retries, 0);
    context.mock.method(globalThis, "fetch", async () => Response.json({
        data: null,
        errors: [
            {
                message: "denied fixture_only",
            },
        ],
    }));
    await assert.rejects(client.request("/graphql", "query { viewer { login } }"), (error) => {
        assert.match(error.message, /denied \[redacted\]/);
        assert.doesNotMatch(error.message, /fixture_only/);
        return true;
    });
});

test("artifact selection rejects other branches, forks, expired artifacts and unrelated workflows", async () => {
    const defaultBranch = "fixture_default";
    const artifact = (id, overrides = {}) => ({
        id,
        name: snapshotToolPolicy.artifactName,
        expired: false,
        created_at: `2026-10-${String(id).padStart(2, "0")}T00:00:00Z`,
        workflow_run: {
            id,
            head_branch: defaultBranch,
            head_repository_id: 42,
        },
        ...overrides,
    });
    const candidates = [
        artifact(1),
        artifact(2),
        artifact(3, {
            expired: true,
        }),
        artifact(4, {
            workflow_run: {
                id: 4,
                head_branch: "feature",
                head_repository_id: 42,
            },
        }),
        artifact(5, {
            workflow_run: {
                id: 5,
                head_branch: defaultBranch,
                head_repository_id: 43,
            },
        }),
        artifact(6),
        artifact(7),
    ];
    const inspected = [];
    const outputs = {};
    await selectSnapshots({
        github: {
            rest: {
                actions: {
                    listArtifactsForRepo: async () => ({
                        data: {
                            artifacts: candidates,
                        },
                    }),
                    getWorkflowRun: async ({ run_id }) => {
                        inspected.push(run_id);
                        return {
                            data: {
                                id: run_id,
                                path: run_id === 6 ? ".github/workflows/unrelated.yml" : snapshotToolPolicy.workflow,
                                event: "schedule",
                                conclusion: "failure",
                            },
                        };
                    },
                },
            },
        },
        context: {
            runId: 7,
            repo: {
                owner: fixtureLogin,
                repo: "website",
            },
            payload: {
                repository: {
                    id: 42,
                    default_branch: defaultBranch,
                },
            },
        },
        core: {
            info: () => {},
            setOutput: (key, value) => {
                outputs[key] = value;
            },
        },
    });
    assert.deepEqual(inspected, [6, 2]);
    assert.deepEqual(outputs, {
        artifact_name: snapshotToolPolicy.artifactName,
        snapshot_files: snapshotToolPolicy.filenames.map((filename) => join(snapshotDirectory, filename)).join("\n"),
        restore_directory: restoredSnapshotDirectory,
        artifact_id: "2",
        run_id: "2",
    });
});

test("snapshot readiness rejects stale, future and legacy data using the same requirements", async (context) => {
    context.mock.method(globalThis, "fetch", fixtureFetch());
    const { snapshots, updated } = await fetchGithubSnapshots(new GithubClient("fixture_only"), fixtureLogin, {}, fixtureNow);
    assert.equal(refreshReadiness(snapshots, updated, fixtureNow.valueOf()).ready, true);
    const old = structuredClone(snapshots);
    old.contributions.lastSuccessfulFetchAt = new Date(fixtureNow.valueOf() - 2 * dayMilliseconds).toISOString();
    assert.deepEqual(refreshReadiness(old, updated, fixtureNow.valueOf()).unusable, ["contributions"]);
    assert.equal(refreshReadiness(snapshots, updated, fixtureNow.valueOf() - 1).ready, false);
    delete old.contributions.data.commitDays;
    old.contributions.lastSuccessfulFetchAt = fixtureNow.toISOString();
    assert.equal(refreshReadiness(old, updated, fixtureNow.valueOf()).ready, false);
});

test("native workflow scheduling agrees with refresh policy and consumes shared artifact outputs", async () => {
    const workflow = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
    assert.ok(workflow.includes(`*/${githubToolPolicy.refreshHours} * * *`));
    assert.ok(workflow.includes("github.event.repository.default_branch"));
    assert.ok(workflow.includes("steps.previous_snapshots.outputs.snapshot_files"));
    assert.ok(workflow.includes("SNAPSHOT_RESTORE_DIR:"));
    assert.ok(workflow.includes("pnpm refresh:media"));
    assert.doesNotMatch(workflow, /continue-on-error/);
    assert.doesNotMatch(workflow, /github_(profile|repositories|contributions|activity)\.json|git (add|commit|push)/);
});

test("one failed dataset preserves only its previous snapshot and timestamp", async (context) => {
    const { snapshots: saved } = await snapshots(context);
    const previous = {
        repositories: {
            ...saved.repositories,
            lastSuccessfulFetchAt: "2026-10-01T00:00:00Z",
        },
    };
    const client = {
        request: async (path) => {
            if (path === "/graphql") throw new Error("Missing token");
            return {
                body: {
                    login: fixtureLogin,
                    html_url: `https://github.com/${fixtureLogin}`,
                    followers: 1,
                    following: 2,
                    public_repos: 1,
                },
            };
        },
        list: async (path) => {
            if (path.includes("/repos")) throw new Error("Unavailable");
            return {
                items: [],
                complete: true,
            };
        },
    };
    const result = await fetchGithubSnapshots(client, fixtureLogin, previous, fixtureNow);
    assert.strictEqual(result.snapshots.repositories, previous.repositories);
    assert.deepEqual(result.updated, ["profile", "activity"]);
    assert.equal(result.snapshots.contributions, undefined);
    assert.equal(result.snapshots.profile.lastSuccessfulFetchAt, fixtureNow.toISOString());
    assert.deepEqual(result.snapshots.activity.data, []);
});
