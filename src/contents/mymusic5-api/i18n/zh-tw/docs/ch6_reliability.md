---
slug: /reliability
title: 設定與錯誤處理
sidebar_position: 6
---

# 設定與錯誤處理

## Client 選項

以下傳入 `new MyMusic5Client(options)`。這些是應用程式設定，不是 MyMusic5 公告的配額。

| 選項 | 預設值 | 說明／限制 |
| --- | --- | --- |
| `timeoutMs` | `15000` | 每次上游嘗試，包含讀取 JSON；整數 1–2147483647 |
| `retries` | `2` | 額外重試次數；整數 0–5 |
| `retryDelayMs` | `250` | 指數退避的初始等待時間；整數 0–60000 |
| `maxRetryDelayMs` | `30000` | 最大重試等待時間；整數 0–60000 |
| `concurrency` | `4` | 單頁內的詳情請求併發數；整數 1–20 |
| `pageSize` | `20` | 預設每頁筆數；整數 1–100 |
| `maxPages` | `1000` | 完整走訪的頁數上限；正安全整數 |
| `fetch` | 全域 `fetch` | 可注入測試或觀測用的 transport 函數 |
| `baseUrl` | `https://mms.pd.mapia.io/mms/` | 由可信任的應用程式設定指定上游網址 |

`baseUrl` 只接受 HTTP(S)，不能包含帳密、query 或 fragment，也不能透過 HTTP query parameter 指定。各程式庫操作另可傳入 `signal`，用於取消或限制整體時間。

## 重試

網路錯誤、逾時、HTTP 429 與上游 5xx 可以重試。無效 JSON、GraphQL 錯誤、無效分頁資料及詳情 404 不會當成暫時錯誤反覆重試。

沒有 `Retry-After` 時，從 `retryDelayMs` 開始指數退避，最多等待 `maxRetryDelayMs`。`Retry-After` 可為秒數或 HTTP 日期；若要求的等待超過設定上限，會直接失敗，不會提早重試。取消操作也會中止等待。

## 錯誤回應

HTTP 錯誤使用 `application/problem+json`，例如：

```json
{
    "type": "about:blank",
    "title": "Bad Request",
    "status": 400,
    "code": "INVALID_ARGUMENT",
    "detail": "Query parameter page must occur only once."
}
```

| Status | Code | 意義 |
| --- | --- | --- |
| 400 | `INVALID_ARGUMENT` | ID、選項或 query parameter 不合法 |
| 404 | `ROUTE_NOT_FOUND`、`SHEET_NOT_FOUND` | API 路徑不存在，或上游找不到樂譜 |
| 405 | `METHOD_NOT_ALLOWED` | 此資源只支援 GET 與 HEAD |
| 408 | `REQUEST_ABORTED` | 呼叫端取消操作 |
| 502 | `UPSTREAM_UNAVAILABLE`、`UPSTREAM_HTTP_ERROR`、`INVALID_UPSTREAM_RESPONSE` | 連線、上游 HTTP、JSON、GraphQL 或資料驗證失敗 |
| 502 | `PAGINATION_CHANGED`、`PAGINATION_LIMIT` | 完整走訪途中資料變動或達到頁數上限，以程式庫錯誤回報 |
| 503 | `UPSTREAM_RATE_LIMITED` | 上游回傳 HTTP 429 |
| 504 | `UPSTREAM_TIMEOUT` | 經重試處理後仍發生上游逾時 |
| 500 | `INTERNAL_ERROR` | HTTP 伺服器發生未預期錯誤 |

JavaScript 的 `MyMusic5Error` 提供 `code`、`status`、`message` 與選用的 `retryAfter`。HTTP adapter 使用 `detail` 放安全訊息，並在有值時轉傳 `Retry-After`。不會將未預期的內部診斷或上游 response body 直接放入 HTTP 錯誤。

兩個 HTTP 端點只回傳單筆或單頁；完整走訪錯誤適用於程式庫的迭代器與 `collectSheets()`。失敗請求不會回傳看似成功的部分 `data` 陣列。
