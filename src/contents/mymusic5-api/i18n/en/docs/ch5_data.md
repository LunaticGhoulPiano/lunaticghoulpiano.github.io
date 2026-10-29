---
slug: /data
title: Data and pagination
sidebar_position: 5
---

# Data and pagination

## Public objects are preserved

The API returns the public sheet detail object without an allowlist or a duplicate `raw` wrapper. This includes additional fields introduced upstream, nested author/file/tag/SEO metadata, nulls, prices, and free/paid flags when present.

The following are examples of fields, not an exhaustive schema or a guarantee that every upstream record supplies them:

| Field | Handling |
| --- | --- |
| `sheetId` | Must match the requested positive safe integer |
| `title`, `description` | Preserved without rewriting text or description markup |
| `author` | Preserved; collection entries must belong to the requested `artistUrl` |
| `files`, `tags`, SEO and future fields | Preserved, including nested data |
| `isFree`, `price`, `currency` | Preserved; paid works are included |
| `createdAt`, `updatedAt` | Original timestamp strings are retained |

The TypeScript `Sheet` type leaves room for unknown public fields. JSON property order, whitespace, and transport bytes are not guaranteed.

`updatedAt` does not prove that the score file was revised at that time. A timestamp without a timezone is not silently converted to UTC. `meta.fetchedAt` is separate API fetch metadata, not a publication date.

Description markup is source data. Applications rendering it as HTML are responsible for deciding how it should be sanitized.

## Website URLs and API URLs

| Destination | Pattern |
| --- | --- |
| Artist's MyMusic5 page | `https://www.mymusic5.com/{artistUrl}` |
| Sheet's MyMusic5 page | `https://www.mymusic5.com/{artistUrl}/{sheetId}` |
| Detail on your API server | `/v1/sheets/{sheetId}` |

For a sheet's website URL, use its returned `author.artistUrl` when available. `links.self` refers to this API, not to the MyMusic5 website.

## How complete pages are fetched

1. `POST https://mms.pd.mapia.io/mms/graphql` supplies sheet IDs, author membership, and pagination totals.
2. `GET https://mms.pd.mapia.io/mms/public/sheet/{sheetId}` supplies each member's full public details.
3. Detail requests run with bounded concurrency; the returned array retains upstream page order.

A page containing N sheets normally requires **1 + N upstream requests**, before retries. A complete traversal does not assume a particular artist or a fixed catalog size.

## Completion checks

Each page validates its number, size, expected entry count, unique IDs, and ownership. Complete collection and iterator methods additionally reject changing totals, repeated IDs across pages, and reaching `maxPages` before completion.

The source uses page-based pagination, not an atomic snapshot. Some concurrent changes that leave totals and observed membership consistent cannot be detected. A failed operation throws rather than reporting an incomplete catalog as complete.

There is no built-in cache. Consumers can save successful results using their own refresh and storage policies.
