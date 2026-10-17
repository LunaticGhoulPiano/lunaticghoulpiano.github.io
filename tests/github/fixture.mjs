export const fixtureNow = new Date("2026-10-17T12:00:00.000Z");
export const fixtureLogin = "example";

export function repository(id, visibility = "PUBLIC") {
    return {
        id,
        nameWithOwner: `another_owner/${id}`,
        url: `https://github.com/another_owner/${id}`,
        visibility,
    };
}

function contribution(id, visibility = "PUBLIC") {
    return {
        occurredAt: "2026-10-03T12:00:00Z",
        isRestricted: false,
        resource: {
            id,
            repository: repository("project", visibility),
        },
    };
}

export function fixtureFetch({ calls = [], transformGraphql = (data) => data, empty = false } = {}) {
    return async (url, options) => {
        const path = new URL(url).pathname;
        if (path === `/users/${fixtureLogin}`) {
            return Response.json({
                login: fixtureLogin,
                html_url: `https://github.com/${fixtureLogin}`,
                followers: 1,
                following: 2,
                public_repos: 0,
            });
        }
        if (path === `/users/${fixtureLogin}/repos` || path === `/users/${fixtureLogin}/events/public`) return Response.json([]);
        if (path !== "/graphql") throw new Error(`Unexpected fixture request: ${path}`);

        const { query, variables } = JSON.parse(options.body);
        calls.push({
            query,
            variables,
        });
        let collection;
        let privateDays;
        if (query.includes("privateDay0:")) {
            const counts = {
                "2026-10-03": 80,
                "2026-10-01": 2,
            };
            privateDays = Object.fromEntries(
                [...query.matchAll(/(privateDay\d+): contributionsCollection\(from: "([^"]+)"/g)].map((match) => [
                    match[1],
                    {
                        restrictedContributionsCount: counts[match[2].slice(0, 10)] ?? 0,
                    },
                ]),
            );
        } else if (query.includes("commitContributionsByRepository")) {
            collection = {
                restrictedContributionsCount: empty ? 0 : 82,
                totalRepositoriesWithContributedCommits: empty ? 0 : 2,
                commitContributionsByRepository: empty ? [] : [
                    {
                        repository: repository("public_project"),
                        contributions: {
                            totalCount: 7,
                            pageInfo: {
                                hasNextPage: false,
                                endCursor: null,
                            },
                            nodes: [
                                {
                                    occurredAt: "2026-10-01T00:00:00Z",
                                    commitCount: 3,
                                    isRestricted: false,
                                },
                                {
                                    occurredAt: "2026-10-02T00:00:00Z",
                                    commitCount: 4,
                                    isRestricted: false,
                                },
                            ],
                        },
                    },
                    {
                        repository: repository("private_project", "PRIVATE"),
                        contributions: {
                            totalCount: 99,
                            pageInfo: {
                                hasNextPage: false,
                                endCursor: null,
                            },
                            nodes: [],
                        },
                    },
                ],
            };
        } else {
            const field = query.match(/entries: (\w+)/)?.[1];
            const sources = {
                issueContributions: [contribution("issue1"), contribution("hidden_issue", "PRIVATE"), contribution("issue2")],
                pullRequestContributions: [contribution("pr1"), contribution("pr2"), contribution("pr3")],
                pullRequestReviewContributions: [contribution("reviewed_pr")],
            };
            if (! sources[field]) throw new Error(`Unexpected contribution field: ${field}`);
            const all = empty ? [] : sources[field];
            const paginate = field === "issueContributions" && ! empty;
            const hasNextPage = paginate && ! variables.cursor;
            collection = {
                entries: {
                    totalCount: all.length,
                    pageInfo: {
                        hasNextPage,
                        endCursor: hasNextPage ? "second_page" : null,
                    },
                    nodes: paginate ? all.slice(variables.cursor ? 2 : 0, variables.cursor ? 3 : 2) : all,
                },
            };
        }
        return Response.json(transformGraphql({
            data: {
                user: privateDays ?? {
                    contributionsCollection: collection,
                },
                rateLimit: {
                    cost: 1,
                    remaining: 4999,
                    resetAt: "2026-10-17T13:00:00Z",
                },
            },
        }, query, variables));
    };
}
