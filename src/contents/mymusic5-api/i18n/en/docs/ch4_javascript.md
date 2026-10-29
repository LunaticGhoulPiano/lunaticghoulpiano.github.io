---
slug: /javascript
title: JavaScript reference
sidebar_position: 4
---

# JavaScript reference

```js
import { MyMusic5Client, MyMusic5Error } from "mymusic5-api";

const client = new MyMusic5Client({ concurrency: 3 });
```

The package is ESM. Each method accepts an optional `AbortSignal`; constructor settings are documented under [Configuration and errors](./ch6_reliability.md).

The snippets below use `artistUrl` and `sheetId` supplied by your application: an artist's handle and a public sheet ID, respectively.

## Methods and results

| Method | Options | Result |
| --- | --- | --- |
| `sheets.get(sheetId, options)` | `signal` | `Promise<Sheet>` |
| `artists.listSheets(artistUrl, options)` | `page`, `pageSize`, `sort`, `signal` | `Promise<SheetPage>` |
| `artists.iterateSheetPages(artistUrl, options)` | `pageSize`, `sort`, `signal` | Async generator of `SheetPage` |
| `artists.iterateSheets(artistUrl, options)` | `pageSize`, `sort`, `signal` | Async generator of `Sheet` |
| `artists.collectSheets(artistUrl, options)` | `pageSize`, `sort`, `signal` | `Promise<SheetCollection>` |

`get()` returns the sheet object directly, without the HTTP detail envelope. `listSheets()` returns the same page envelope as the HTTP collection route. Page numbers start at 1. The constructor's `pageSize` applies when a call does not supply one; sorting defaults to `-createdAt`.

## Complete catalog

```js
const catalog = await client.artists.collectSheets(artistUrl, {
    pageSize: 50,
    signal: AbortSignal.timeout(120_000),
});

console.log(catalog.data);
console.log(catalog.meta);
```

`meta` contains `total`, `pages`, `complete: true`, and `fetchedAt`. An empty catalog still performs one page request and reports `pages: 1`. The method either returns a complete collection or throws; it never returns `complete: false` with a partial collection.

## Stream sheets or pages

```js
for await (const sheet of client.artists.iterateSheets(artistUrl, {
    pageSize: 20,
    sort: "createdAt",
})) {
    console.log(sheet.sheetId, sheet.title);
}
```

For access to pagination metadata, use `iterateSheetPages()` instead. Iterators start at page 1 and honor the constructor's `maxPages` limit. Breaking out of the loop stops later page requests.

Earlier pages may have been consumed before a later request fails. Consumers must not claim that a streamed catalog is complete until iteration finishes successfully. Use `collectSheets()` when you need an all-or-error result before saving a catalog.

## Handle errors and cancellation

```js
try {
    const sheet = await client.sheets.get(sheetId, {
        signal: AbortSignal.timeout(30_000),
    });
    console.log(sheet.title);
}
catch (error) {
    if (error instanceof MyMusic5Error) {
        console.error(error.code, error.status, error.message);
    }
    else {
        throw error;
    }
}
```

A caller's aborted signal produces `REQUEST_ABORTED` with status 408. The per-attempt upstream timeout is separate and produces `UPSTREAM_TIMEOUT` with status 504 after retry handling.

## Embed the HTTP adapter

```js
import { MyMusic5Client } from "mymusic5-api";
import { createApiServer } from "mymusic5-api/http";

const client = new MyMusic5Client({ timeoutMs: 15_000, concurrency: 3 });
const server = createApiServer({ client });
server.listen(3000, "127.0.0.1");
```

`createApiHandler({ client })` returns a handler for an existing Node HTTP server. `createApiServer({ client })` creates a server without starting it. When embedding either adapter, your application owns startup and shutdown; the CLI's signal handlers are not installed automatically.
