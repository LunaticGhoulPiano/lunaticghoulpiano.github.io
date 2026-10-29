---
slug: /http-api
title: HTTP 參考
sidebar_position: 3
---

# HTTP 參考

以下路徑都相對於你執行中的 API 伺服器，範例使用 `http://127.0.0.1:3000`。文檔網站本身沒有代管 API 伺服器。

兩個資源都支援 `GET` 與 `HEAD`。API 路徑必須完全相符，尾端不要加 `/`。成功回應使用 `application/json; charset=utf-8` 與 `Cache-Control: no-store`。

## 取得單份樂譜

```http
GET /v1/sheets/{sheetId}
```

`sheetId` 必須是正的安全整數；以字串傳入時只能包含數字且不能有前導零。此端點不接受 query parameters。

| 回應欄位 | 說明 |
| --- | --- |
| `data` | 原樣保留的完整公開樂譜物件 |
| `links.self` | 這份樂譜的 API 相對網址 |
| `meta.fetchedAt` | 組成包裝回應的時間，使用 UTC ISO 時間格式 |

以下是刪減過的示意資料；實際 `data` 會保留上游全部欄位：

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

## 列出作者樂譜

```http
GET /v1/artists/{artistUrl}/sheets?page=1&pageSize=20&sort=-createdAt
```

`artistUrl` 是作者 handle，不是完整網址。對於 `https://www.mymusic5.com/{author}`，傳入 `{author}` 代表的作者 handle，不包含大括號。

Handle 不可為空，最多 200 個 JavaScript 字串 code units，不能包含空白、控制字元、`/`、`\`、`?`、`#` 或 `%`，也不能只有 `.` 或 `..`。組合網址時，應將有效的路徑片段做 URL 編碼。

| Query parameter | 預設值 | 可用值 |
| --- | --- | --- |
| `page` | `1` | 正整數；計算後的分頁 offset 也必須保持安全整數 |
| `pageSize` | `20` | 1 到 100 的整數 |
| `sort` | `-createdAt` | `-createdAt` 由新到舊；`createdAt` 由舊到新 |

HTTP 數字參數必須是沒有前導零的正整數字串。不支援或重複的 query parameter 會回傳 `400 INVALID_ARGUMENT`。

| 回應欄位 | 說明 |
| --- | --- |
| `data` | 完整公開樂譜物件陣列，維持上游分頁順序 |
| `pagination.page` | 要求的頁碼 |
| `pagination.pageSize` | 要求的每頁筆數 |
| `pagination.total` | MyMusic5 回報的總筆數 |
| `pagination.totalPages` | `ceil(total / pageSize)` |
| `links.self` | 帶有明確 query parameters 的目前頁面網址 |
| `links.next` | 下一頁網址，或 `null` |
| `links.previous` | 上一頁網址，或 `null` |
| `meta.fetchedAt` | 組成此頁回應的時間 |

持續跟隨 `links.next`，直到值為 `null`。連結相對於 API origin。HTTP `Link` header 也會以 `self`、`next`、`prev` 關係提供相同網址，省略 null 項目。

超過最後一頁會得到空的 `data`。空清單的 `total` 與 `totalPages` 都是 0，無法據此區分作者不存在或沒有公開樂譜。任一詳情抓取失敗會讓整頁失敗，不會將缺少資料的陣列當成成功結果。

## HTTP 行為

- `HEAD` 與 `GET` 執行相同抓取及驗證，回傳相同 headers，但沒有 body；不會因此減少上游請求。
- 對有效資源使用其他 method，回傳 `405` 與 `Allow: GET, HEAD`。
- 未知路徑回傳 `404`。
- 用戶端斷線會取消相關上游工作。
- 錯誤使用 `application/problem+json`，詳見[設定與錯誤處理](./ch6_reliability.md)。

伺服器沒有設定 CORS、認證或本機限流。若瀏覽器應用程式位於不同 origin，需在部署或代理層處理存取設定。開啟文檔不會自行呼叫 API。
