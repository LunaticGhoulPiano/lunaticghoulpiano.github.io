---
title: 概覽
slug: /
sidebar_position: 1
---

# MyMusic5API

MyMusic5API 是取得 [MyMusic5](https://www.mymusic5.com/) 公開樂譜資料的非官方唯讀 API，提供共用同一核心的 REST HTTP 伺服器與 JavaScript 程式庫。

本文檔對應 **0.1.0** 版，使用 Apache-2.0 授權，需要 **Node.js 22 或更新版本**。

## 可以取得什麼

| 資源 | HTTP | JavaScript |
| --- | --- | --- |
| 單份公開樂譜的完整資料 | `GET /v1/sheets/{sheetId}` | `client.sheets.get(sheetId)` |
| 作者公開樂譜的其中一頁 | `GET /v1/artists/{artistUrl}/sheets` | `client.artists.listSheets(artistUrl, options)` |
| 作者的完整公開樂譜清單 | 持續跟隨 `links.next` | `client.artists.collectSheets(artistUrl, options)` |

免費與付費作品都包含在內。公開詳情物件會原樣保留，包括巢狀物件、null，以及未來由 MyMusic5 新增的欄位。作者與樂譜數量不會寫死。

API 取得的是公開資料，不會下載購買後才能取得的樂譜檔案，也不會存取私人帳號資料。這些操作不需要 MyMusic5 帳號或 API key。

## 選擇使用方式

- **HTTP API**：供其他應用程式或程式語言透過 HTTP 取得 JSON。
- **JavaScript 程式庫**：Node.js 應用程式直接呼叫共用核心；import 本身不會啟動伺服器。

兩種方式共用相同驗證與資料抓取流程，作者清單中的每筆也會取得完整詳情。從[快速開始](./ch2_quick-start.md)、[HTTP 參考](./ch3_http-api.md)或 [JavaScript 參考](./ch4_javascript.md)繼續。

## 目前範圍

目前實作樂譜詳情與作者樂譜清單，沒有全域搜尋、獨立作者資料端點、認證或寫入操作。清單為空也不能證明作者存在。

上游使用 MyMusic5 網站介面，可能隨網站改版而變動。欄位與完整性保證見[資料與分頁](./ch5_data.md)，錯誤行為見[設定與錯誤處理](./ch6_reliability.md)。

[原始碼與問題回報](https://github.com/LunaticGhoulPiano/MyMusic5API)
