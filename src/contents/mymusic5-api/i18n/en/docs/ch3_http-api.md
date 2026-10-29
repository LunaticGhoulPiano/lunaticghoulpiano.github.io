---
slug: /http-api
title: HTTP reference
sidebar_position: 3
---

# HTTP reference

All paths are relative to your running API server. Examples use `http://127.0.0.1:3000`; the documentation website itself does not host an API server.

Both resources support `GET` and `HEAD`. Paths are exact: do not append a trailing slash to these API endpoints. Successful responses use `application/json; charset=utf-8` and `Cache-Control: no-store`.

## Get a sheet

```http
GET /v1/sheets/{sheetId}
```

`sheetId` is a positive safe integer. A string representation must contain digits without a leading zero. This resource accepts no query parameters.

The response contains:

| Field | Meaning |
| --- | --- |
| `data` | Complete, unchanged public sheet object |
| `links.self` | Relative API URL for the sheet |
| `meta.fetchedAt` | Time the wrapper response was created, as a UTC ISO timestamp |

The following example is illustrative and abbreviated; actual `data` contains all fields returned upstream:

```json
{
    "data": {
        "sheetId": 123,
        "title": "Example score",
        "isFree": false,
        "price": 3,
        "currency": "USD"
    },
    "links": { "self": "/v1/sheets/123" },
    "meta": { "fetchedAt": "2026-10-29T00:00:00.000Z" }
}
```

## List an artist's sheets

```http
GET /v1/artists/{artistUrl}/sheets?page=1&pageSize=20&sort=-createdAt
```

`artistUrl` is the artist's handle, not a full URL. For a profile at `https://www.mymusic5.com/{author}`, pass the handle represented by `{author}` without the braces.

The handle must be nonempty, at most 200 JavaScript string code units long, and cannot contain whitespace, control characters, `/`, `\`, `?`, `#`, or `%`. `.` and `..` alone are also invalid. Encode valid path segments when constructing a request.

| Query parameter | Default | Allowed values |
| --- | --- | --- |
| `page` | `1` | Positive integer; the calculated page offset must remain a safe integer |
| `pageSize` | `20` | Integer from 1 to 100 |
| `sort` | `-createdAt` | `-createdAt` for newest first; `createdAt` for oldest first |

Numeric HTTP query values must contain positive decimal digits without leading zeros. Unknown or repeated query parameters produce `400 INVALID_ARGUMENT`.

| Response field | Meaning |
| --- | --- |
| `data` | Array of complete public sheet objects in upstream page order |
| `pagination.page` | Requested page number |
| `pagination.pageSize` | Requested page size |
| `pagination.total` | Total reported by MyMusic5 |
| `pagination.totalPages` | `ceil(total / pageSize)` |
| `links.self` | Current page URL with explicit query parameters |
| `links.next` | Next page URL, or `null` |
| `links.previous` | Previous page URL, or `null` |
| `meta.fetchedAt` | Time the page response was assembled |

Follow `links.next` until it is `null`; the links are relative to the API origin. The HTTP `Link` header exposes the same URLs as `self`, `next`, and `prev` relations, omitting null links.

A page beyond the end returns an empty `data` array. An empty catalog has `total: 0` and `totalPages: 0`; it cannot distinguish an unknown artist from an artist with no public sheets. A failed detail request fails the entire page instead of returning an apparently complete partial array.

## HTTP behavior

- `HEAD` performs the same fetch and validation as `GET`, with the same headers but no response body. It is not a cheaper upstream operation.
- Unsupported methods on these resources return `405` with `Allow: GET, HEAD`.
- Unrecognized routes return `404`.
- Client disconnects cancel the associated upstream work.
- Error responses use `application/problem+json`. See [Configuration and errors](./ch6_reliability.md).

The server does not configure CORS, authentication, or a local rate limiter. If a browser application is hosted on a different origin, configure access through your hosting or proxy layer. Opening these documentation pages does not send API requests.
