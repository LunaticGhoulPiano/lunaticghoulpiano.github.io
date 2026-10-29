---
title: Overview
slug: /
sidebar_position: 1
---

# MyMusic5API

MyMusic5API is an unofficial, read-only API for public sheet music metadata on [MyMusic5](https://www.mymusic5.com/). It provides a REST HTTP server and a JavaScript library backed by the same core.

This documentation describes version **0.1.0**. The project uses the Apache-2.0 license and requires **Node.js 22 or newer**.

## What you can retrieve

| Resource | HTTP | JavaScript |
| --- | --- | --- |
| Complete public sheet details | `GET /v1/sheets/{sheetId}` | `client.sheets.get(sheetId)` |
| One page of an artist's public sheets | `GET /v1/artists/{artistUrl}/sheets` | `client.artists.listSheets(artistUrl, options)` |
| An artist's complete public catalog | Follow `links.next` | `client.artists.collectSheets(artistUrl, options)` |

Free and paid works are included. The original public detail object is preserved, including nested objects, null values, and fields added by MyMusic5 in the future. Authors and catalog sizes are supplied at runtime.

The API retrieves metadata. It does not download purchased score files or access private account data. Public metadata operations do not require a MyMusic5 account or API key.

## Choose an interface

- Use the **HTTP API** when another application or language needs JSON over HTTP.
- Use the **JavaScript library** when your Node.js application can call the shared core directly. Importing it does not start an HTTP server.

Both interfaces perform the same validation and fetch complete sheet details for collection members. See [Quick start](./ch2_quick-start.md), [HTTP reference](./ch3_http-api.md), and [JavaScript reference](./ch4_javascript.md).

## Current boundaries

This version implements sheet details and artist sheet collections. It does not expose global search, an independent artist-profile endpoint, authentication, or writes. An empty collection does not establish that the artist exists.

The upstream interfaces belong to the MyMusic5 website and can change. See [Data and pagination](./ch5_data.md) for field guarantees and [Configuration and errors](./ch6_reliability.md) for failure behavior.

[Source code and issues](https://github.com/LunaticGhoulPiano/MyMusic5API)
