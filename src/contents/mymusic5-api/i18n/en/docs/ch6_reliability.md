---
slug: /reliability
title: Configuration and errors
sidebar_position: 6
---

# Configuration and errors

## Client options

Pass these to `new MyMusic5Client(options)`. They are application settings, not documented MyMusic5 quotas.

| Option | Default | Meaning / limit |
| --- | --- | --- |
| `timeoutMs` | `15000` | Per upstream attempt, including JSON reading; integer 1–2147483647 |
| `retries` | `2` | Additional attempts; integer 0–5 |
| `retryDelayMs` | `250` | Initial exponential delay; integer 0–60000 |
| `maxRetryDelayMs` | `30000` | Maximum retry wait; integer 0–60000 |
| `concurrency` | `4` | Parallel detail requests within a page; integer 1–20 |
| `pageSize` | `20` | Default collection page size; integer 1–100 |
| `maxPages` | `1000` | Positive safe integer; complete-traversal page limit |
| `fetch` | Global `fetch` | Injectable transport function |
| `baseUrl` | `https://mms.pd.mapia.io/mms/` | Trusted application configuration for the upstream endpoint |

`baseUrl` must use HTTP(S), without credentials, query parameters, or a fragment. It is not accepted as an HTTP query parameter. Library methods accept `signal` for cancellation or a total deadline in addition to the per-attempt timeout.

## Retries

Network errors, timeouts, HTTP 429, and upstream 5xx responses are eligible for retries. Invalid JSON, GraphQL errors, invalid page data, and detail 404 responses are not retried as transient failures.

Without `Retry-After`, delay grows exponentially from `retryDelayMs` and is capped by `maxRetryDelayMs`. A supplied `Retry-After` can be a number of seconds or an HTTP date. If the requested wait exceeds the configured maximum, the operation fails instead of retrying earlier than requested. Cancellation also stops retry waits.

## Error response

HTTP failures use `application/problem+json`. For example:

```json
{
    "type": "about:blank",
    "title": "Bad Request",
    "status": 400,
    "code": "INVALID_ARGUMENT",
    "detail": "Query parameter page must occur only once."
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_ARGUMENT` | Invalid identifier, option, or query parameter |
| 404 | `ROUTE_NOT_FOUND`, `SHEET_NOT_FOUND` | Unknown API route or upstream sheet not found |
| 405 | `METHOD_NOT_ALLOWED` | Resource only supports GET and HEAD |
| 408 | `REQUEST_ABORTED` | Caller cancelled the operation |
| 502 | `UPSTREAM_UNAVAILABLE`, `UPSTREAM_HTTP_ERROR`, `INVALID_UPSTREAM_RESPONSE` | Connection, upstream HTTP, JSON, GraphQL, or validation failure |
| 502 | `PAGINATION_CHANGED`, `PAGINATION_LIMIT` | Complete traversal changed or exceeded its page limit; returned through library errors |
| 503 | `UPSTREAM_RATE_LIMITED` | Upstream returned HTTP 429 |
| 504 | `UPSTREAM_TIMEOUT` | Upstream attempt timed out after retry handling |
| 500 | `INTERNAL_ERROR` | Unexpected HTTP server error |

`MyMusic5Error` exposes `code`, `status`, `message`, and optional `retryAfter` in JavaScript. The HTTP adapter uses `detail` for the safe message and forwards `Retry-After` when present. Unexpected internal diagnostics and upstream response bodies are not included in HTTP errors.

The two HTTP routes return one sheet or one page; complete-traversal errors apply to the library's iterators and `collectSheets()`. Failed requests do not return a successful partial `data` array.
