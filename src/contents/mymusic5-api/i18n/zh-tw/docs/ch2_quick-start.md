---
slug: /quick-start
title: 快速開始
sidebar_position: 2
---

# 快速開始

## 啟動 HTTP 伺服器

安裝 Node.js 22 或更新版本後執行：

```sh
git clone https://github.com/LunaticGhoulPiano/MyMusic5API.git
cd MyMusic5API
node src/cli.js
```

預設位址是 `http://127.0.0.1:3000`。目前 API 本身沒有需要安裝的執行期套件依賴。保持伺服器執行，在另一個終端機測試。將 `{sheetId}` 換成公開樂譜 ID、`{author}` 換成作者 handle，替換時移除大括號：

```sh
curl "http://127.0.0.1:3000/v1/sheets/{sheetId}"
curl "http://127.0.0.1:3000/v1/artists/{author}/sheets?page=1&pageSize=20&sort=-createdAt"
```

如果 PowerShell 將 `curl` 當成自身的別名，請使用 `curl.exe`。

以[這份公開樂譜](https://www.mymusic5.com/lunaticghoulpiano/253271)示範實際請求：

```sh
curl "http://127.0.0.1:3000/v1/sheets/253271"
```

透過 `HOST`、`PORT` 環境變數更改監聽位址。例如 PowerShell：

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "3001"
node src/cli.js
```

預設只接受本機連線。`PORT` 必須是 1 到 65535 的整數。Ctrl+C 會送出 SIGINT；CLI 也處理 SIGTERM，並關閉伺服器。

## 直接使用程式庫

在另一個應用程式中，安裝已經下載到本機的 API 專案：

```sh
pnpm add ./path/to/MyMusic5API
```

這是安裝本機套件，不代表 `mymusic5-api` 已發布到 npm registry。將下方的 `{author}` 換成想查詢的作者 handle。

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

若程式放在 API repo 根目錄，可以改從 `./src/index.js` 匯入。套件也提供 TypeScript 型別宣告。

## 驗證 API checkout

在 API repo 執行既有離線測試：

```sh
node --test test/*.test.js
```

測試使用固定資料與本機 HTTP 伺服器。以下是另外提供的即時契約檢查，會連線 MyMusic5，驗證指定作者：

```sh
node scripts/verify-live.mjs {author}
```

將 `{author}` 換成作者 handle，並移除大括號。即時檢查會走訪分頁、比對完整上游詳情，不會寫入快照。這是獨立的 API 驗證指令，建置文檔不會執行它。
