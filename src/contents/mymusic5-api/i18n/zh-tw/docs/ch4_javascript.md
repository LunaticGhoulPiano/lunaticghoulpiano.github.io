---
slug: /javascript
title: JavaScript 參考
sidebar_position: 4
---

# JavaScript 參考

```js
import { MyMusic5Client, MyMusic5Error } from "mymusic5-api";

const client = new MyMusic5Client({ concurrency: 3 });
```

套件使用 ESM。各操作可傳入選用的 `AbortSignal`；建構子選項見[設定與錯誤處理](./ch6_reliability.md)。

以下片段使用由應用程式提供的 `artistUrl` 與 `sheetId`，分別代表作者 handle 與公開樂譜 ID。

## 方法與回傳值

| 方法 | Options | 回傳值 |
| --- | --- | --- |
| `sheets.get(sheetId, options)` | `signal` | `Promise<Sheet>` |
| `artists.listSheets(artistUrl, options)` | `page`、`pageSize`、`sort`、`signal` | `Promise<SheetPage>` |
| `artists.iterateSheetPages(artistUrl, options)` | `pageSize`、`sort`、`signal` | 逐頁產生 `SheetPage` 的 async generator |
| `artists.iterateSheets(artistUrl, options)` | `pageSize`、`sort`、`signal` | 逐筆產生 `Sheet` 的 async generator |
| `artists.collectSheets(artistUrl, options)` | `pageSize`、`sort`、`signal` | `Promise<SheetCollection>` |

`get()` 直接回傳樂譜物件，沒有 HTTP 詳情回應的外層包裝。`listSheets()` 與 HTTP 清單端點使用相同回應格式。頁碼從 1 開始，未指定 `pageSize` 時沿用建構子設定，排序預設為 `-createdAt`。

## 收集完整清單

```js
const catalog = await client.artists.collectSheets(artistUrl, {
    pageSize: 50,
    signal: AbortSignal.timeout(120_000),
});

console.log(catalog.data);
console.log(catalog.meta);
```

`meta` 包含 `total`、`pages`、`complete: true` 與 `fetchedAt`。空清單仍會要求第一頁，因此回報 `pages: 1`。此方法只會成功回傳完整清單，或拋出錯誤，不會回傳帶有 `complete: false` 的部分結果。

## 逐筆或逐頁處理

```js
for await (const sheet of client.artists.iterateSheets(artistUrl, {
    pageSize: 20,
    sort: "createdAt",
})) {
    console.log(sheet.sheetId, sheet.title);
}
```

需要分頁資訊時改用 `iterateSheetPages()`。迭代從第一頁開始，遵守建構子的 `maxPages` 上限；提早離開迴圈會停止後續頁面請求。

後面的頁面失敗之前，前面的資料可能已經交給呼叫端。只有迭代正常結束後才能宣稱完整。若要等全部成功才儲存，請使用 `collectSheets()`。

## 錯誤與取消

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

呼叫端的 signal 中止時會得到 `REQUEST_ABORTED`，status 為 408。這與每次上游請求的 timeout 不同；後者在重試處理後以 `UPSTREAM_TIMEOUT`、status 504 回報。

## 嵌入 HTTP adapter

```js
import { MyMusic5Client } from "mymusic5-api";
import { createApiServer } from "mymusic5-api/http";

const client = new MyMusic5Client({ timeoutMs: 15_000, concurrency: 3 });
const server = createApiServer({ client });
server.listen(3000, "127.0.0.1");
```

`createApiHandler({ client })` 回傳可接到既有 Node HTTP server 的 handler。`createApiServer({ client })` 建立伺服器但不啟動監聽。嵌入使用時，由應用程式負責啟動與關閉，不會自動安裝 CLI 的 signal handlers。
