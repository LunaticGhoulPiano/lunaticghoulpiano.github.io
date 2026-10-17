import test from "node:test";
import assert from "node:assert/strict";
import { GithubClient } from "../../scripts/github/client.ts";
import { fetchGithubSnapshots } from "../../scripts/github/fetch.ts";
import { githubToolPolicy, requestBudgets } from "../../scripts/github/config.ts";
import { fixtureFetch, fixtureLogin, fixtureNow } from "./fixture.mjs";

test("successful responses at the last available API request are preserved", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({
        value: 1,
    }, {
        headers: {
            "x-ratelimit-remaining": "0",
        },
    }));
    const rest = new GithubClient();
    assert.deepEqual((await rest.request("/fixture")).body, {
        value: 1,
    });
    await assert.rejects(rest.request("/fixture"), /budget/);
    assert.equal(rest.restRequests, 1);

    context.mock.method(globalThis, "fetch", async () => Response.json({
        data: {
            value: 2,
            rateLimit: {
                cost: 1,
                remaining: 0,
                resetAt: fixtureNow.toISOString(),
            },
        },
    }));
    const graph = new GithubClient("fixture_only");
    assert.equal((await graph.request("/graphql", "query {} ")).body.value, 2);
    await assert.rejects(graph.request("/graphql", "query {}"), /budget/);
    assert.equal(graph.graphqlRequests, 1);
});

test("the full pipeline reaches every final page with retries and then enforces both request budgets", async (context) => {
    const attempts = new Map();
    const restPages = new Map();
    const graphPages = new Map();
    const response = fixtureFetch({
        transformGraphql(data, query, variables) {
            const entries = data.data.user.contributionsCollection?.entries;
            if (! entries) return data;
            const field = query.match(/entries: (\w+)/)[1];
            const page = variables.cursor ? Number(variables.cursor) + 1 : 1;
            const node = structuredClone(entries.nodes.find((entry) => entry.resource.repository.visibility === "PUBLIC"));
            node.resource.id = `${field}_${page}`;
            entries.nodes = [node];
            entries.totalCount = githubToolPolicy.contributionPages;
            entries.pageInfo = {
                hasNextPage: page < githubToolPolicy.contributionPages,
                endCursor: String(page),
            };
            graphPages.set(field, page);
            return data;
        },
    });
    context.mock.method(globalThis, "setTimeout", (callback) => {
        queueMicrotask(callback);
        return 0;
    });
    context.mock.method(globalThis, "fetch", async (url, options) => {
        const key = `${url}:${options.body ?? ""}`;
        const attempt = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, attempt);
        if (attempt < githubToolPolicy.attempts) return new Response(null, {
            status: 503,
        });
        const result = await response(url, options);
        const address = new URL(url);
        if (address.searchParams.has("page")) {
            const page = Number(address.searchParams.get("page"));
            const limit = address.pathname.endsWith("/repos") ? githubToolPolicy.repositoryPages : githubToolPolicy.eventPages;
            restPages.set(address.pathname, page);
            if (page < limit) result.headers.set("link", '<https://api.github.com/fixture>; rel="next"');
        }
        return result;
    });
    const client = new GithubClient("fixture_only");
    const result = await fetchGithubSnapshots(client, fixtureLogin, {}, fixtureNow);
    assert.deepEqual(result.failures, []);
    assert.equal(restPages.get(`/users/${fixtureLogin}/repos`), githubToolPolicy.repositoryPages);
    assert.equal(restPages.get(`/users/${fixtureLogin}/events/public`), githubToolPolicy.eventPages);
    for (const field of ["issueContributions", "pullRequestContributions", "pullRequestReviewContributions"]) {
        assert.equal(graphPages.get(field), githubToolPolicy.contributionPages);
    }
    assert.ok([...attempts.values()].every((count) => count === githubToolPolicy.attempts));
    assert.equal(client.restRequests, requestBudgets.rest);
    assert.equal(client.graphqlRequests, requestBudgets.graphql);
    assert.equal(client.retries, [...attempts.values()].reduce((sum, count) => sum + count - 1, 0));
    const calls = attempts.size;
    await assert.rejects(client.request("/fixture"), /budget/);
    await assert.rejects(client.request("/graphql", "query {}"), /budget/);
    assert.equal(attempts.size, calls);
});

test("HTTP 200 GraphQL errors and null data fail validation", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
        Response.json({
            data: null,
            errors: [
                {
                    message: "denied",
                },
            ],
        }),
    );
    const client = new GithubClient("fixture_only");
    await assert.rejects(client.request("/graphql", "query { user { id } }"), /incomplete data/);
});

test("rate limits stop immediately without retrying", async (context) => {
    context.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response("", {
                status: 429,
            }),
    );
    const client = new GithubClient();
    await assert.rejects(client.request("/users/example"), /rate limit/);
    assert.equal(client.restRequests, 1);
    assert.equal(client.retries, 0);
});

test("REST pagination follows next pages and reports truncation", async (context) => {
    const calls = [];
    context.mock.method(globalThis, "fetch", async (url) => {
        calls.push(url);
        const page = new URL(url).searchParams.get("page");
        return new Response(JSON.stringify([page]), {
            headers:
                page === "1"
                    ? {
                        link: '<https://api.github.com/users/example/repos?page=2>; rel="next"',
                    }
                    : {},
        });
    });
    const client = new GithubClient();
    assert.deepEqual(await client.list("/users/example/repos", 3), {
        items: ["1", "2"],
        complete: true,
    });
    assert.deepEqual(await client.list("/users/example/repos", 1), {
        items: ["1"],
        complete: false,
    });
    assert.equal(calls.length, 3);
});
