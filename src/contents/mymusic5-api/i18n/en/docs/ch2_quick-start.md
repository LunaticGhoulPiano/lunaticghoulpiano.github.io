---
slug: /quick-start
title: Quick start
sidebar_position: 2
---

# Quick start

## Start the HTTP server

With Node.js 22 or newer installed:

```sh
git clone https://github.com/LunaticGhoulPiano/MyMusic5API.git
cd MyMusic5API
node src/cli.js
```

The server listens at `http://127.0.0.1:3000`. The current API implementation has no runtime package dependencies to install. Keep the process running while making requests from another terminal. Replace `{sheetId}` with a public sheet ID and `{author}` with an artist's handle, removing the braces.

```sh
curl "http://127.0.0.1:3000/v1/sheets/{sheetId}"
curl "http://127.0.0.1:3000/v1/artists/{author}/sheets?page=1&pageSize=20&sort=-createdAt"
```

In PowerShell, use `curl.exe` if `curl` resolves to a PowerShell alias.

For a concrete demo using [this public sheet](https://www.mymusic5.com/lunaticghoulpiano/253271):

```sh
curl "http://127.0.0.1:3000/v1/sheets/253271"
```

`HOST` and `PORT` configure the listening address. For example, in PowerShell:

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "3001"
node src/cli.js
```

The default host accepts local connections only. `PORT` must be an integer from 1 to 65535. Ctrl+C sends SIGINT; the CLI also handles SIGTERM and closes the server.

## Use the library directly

From an application with a local checkout of the API available:

```sh
pnpm add ./path/to/MyMusic5API
```

This installs the local package. These instructions do not assume that `mymusic5-api` has been published to the npm registry. Replace `{author}` below with the artist you want to retrieve.

```js
import { MyMusic5Client } from "mymusic5-api";

const client = new MyMusic5Client();
const artistUrl = "{author}";
const catalog = await client.artists.collectSheets(artistUrl);

console.log(catalog.meta.complete);
console.log(catalog.meta.total);
for (const sheet of catalog.data) {
    console.log(sheet.sheetId, sheet.title);
}
```

When writing a script inside the API repository, import from `./src/index.js` instead. Package exports include TypeScript declarations.

## Verify the API checkout

Run the existing offline test suite from the API repository:

```sh
node --test test/*.test.js
```

These tests use fixtures and local HTTP servers. The optional command below contacts MyMusic5 and checks the public contract for the supplied artist:

```sh
node scripts/verify-live.mjs {author}
```

Replace `{author}` with the artist's handle, without braces. The live check follows pagination, compares details with upstream responses, and writes no snapshots. It is a separate API verification command, not part of building this documentation.
