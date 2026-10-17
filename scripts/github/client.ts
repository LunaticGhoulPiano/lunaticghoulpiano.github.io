import { githubToolPolicy, requestBudgets } from "./config.ts";
import { z } from "astro/zod";
import { count, timestamp } from "../../src/data/github/schema.ts";

export class GithubClient {
    token: string | undefined;
    restRequests = 0;
    graphqlRequests = 0;
    graphqlPoints = 0;
    retries = 0;
    restExhausted = false;
    graphqlExhausted = false;
    startedAt = Date.now();
    constructor(token?: string) {
        this.token = token;
    }

    async request(
        path: string,
        query?: string,
        variables?: Record<string, unknown>,
    ): Promise<{
        body: unknown;
        headers: Headers;
    }> {
        if (! path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid API path.");
        for (let attempt = 0; attempt < githubToolPolicy.attempts; attempt++) {
            if (Date.now() - this.startedAt > githubToolPolicy.refreshTimeoutMs) throw new Error("Refresh time budget reached.");
            if (query) {
                if (! this.token) throw new Error("A GitHub read token is required for contributions.");
                if (this.graphqlExhausted || this.graphqlRequests >= requestBudgets.graphql || this.graphqlPoints >= githubToolPolicy.graphqlPoints) throw new Error("GraphQL budget reached.");
                this.graphqlRequests++;
            } else {
                if (this.restExhausted || this.restRequests >= requestBudgets.rest) throw new Error("REST request budget reached.");
                this.restRequests++;
            }
            let response: Response;
            try {
                response = await fetch(`${githubToolPolicy.apiUrl}${path}`, {
                    method: query ? "POST" : "GET",
                    headers: {
                        Accept: "application/vnd.github+json",
                        "User-Agent": githubToolPolicy.userAgent,
                        ...(this.token
                            ? {
                                Authorization: `Bearer ${this.token}`,
                            }
                            : {}),
                        ...(query
                            ? {
                                "Content-Type": "application/json",
                            }
                            : {}),
                    },
                    body: query
                        ? JSON.stringify({
                            query,
                            variables,
                        })
                        : undefined,
                    signal: AbortSignal.timeout(Math.min(githubToolPolicy.requestTimeoutMs, Math.max(1, githubToolPolicy.refreshTimeoutMs - (Date.now() - this.startedAt)))),
                    redirect: "error",
                });
            } catch {
                if (attempt === githubToolPolicy.attempts - 1) throw new Error("GitHub connection failed; previous snapshot retained.");
                this.retries++;
                await new Promise((resolve) => setTimeout(resolve, githubToolPolicy.retryDelayMs));
                continue;
            }
            if (response.status === 429) throw new Error("GitHub rate limit reached; no immediate retry.");
            if (response.status === 401) throw new Error("GitHub token is invalid or expired; update WEBPAGE_GITHUB_PROFILE_READONLY.");
            if (response.status === 403) throw new Error("GitHub access denied or secondary rate limit reached; no immediate retry.");
            if (response.status >= 500 && attempt < githubToolPolicy.attempts - 1) {
                this.retries++;
                await new Promise((resolve) => setTimeout(resolve, githubToolPolicy.retryDelayMs));
                continue;
            }
            if (! response.ok) throw new Error(`GitHub request failed (HTTP ${response.status}).`);
            if (! query && response.headers.get("x-ratelimit-remaining") === "0") this.restExhausted = true;
            const body: unknown = await response.json();
            if (query) {
                const envelope = z
                    .object({
                        errors: z.array(z.object({
                            message: z.string(),
                        })).optional(),
                        data: z
                            .looseObject({
                                rateLimit: z.object({
                                    cost: count,
                                    remaining: count,
                                    resetAt: timestamp,
                                }),
                            })
                            .nullable()
                            .optional(),
                    })
                    .parse(body);
                if (envelope.data) this.graphqlPoints += envelope.data.rateLimit.cost;
                if (envelope.errors?.length) {
                    const detail = envelope.errors.slice(0, 3)
                        .map((error) => error.message.replaceAll(this.token!, "[redacted]"))
                        .join("; ");
                    throw new Error(`GraphQL returned incomplete data: ${detail}`);
                }
                if (! envelope.data) throw new Error("GraphQL returned incomplete data: missing data object.");
                this.graphqlExhausted = envelope.data.rateLimit.remaining === 0;
                return {
                    body: envelope.data,
                    headers: response.headers,
                };
            }
            return {
                body,
                headers: response.headers,
            };
        }
        throw new Error("GitHub request failed.");
    }

    async list(path: string, maxPages: number) {
        const items: unknown[] = [];
        for (let page = 1; page <= maxPages; page++) {
            const { body, headers } = await this.request(
                `${path}${path.includes("?") ? "&" : "?"}per_page=${githubToolPolicy.pageSize}&page=${page}`,
            );
            items.push(...z.array(z.unknown()).parse(body));
            if (! headers.get("link")?.includes('rel="next"')) {
                return {
                    items,
                    complete: true,
                };
            }
        }
        return {
            items,
            complete: false,
        };
    }
}
