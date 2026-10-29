---
slug: /data
title: 資料與分頁
sidebar_position: 5
---

# 資料與分頁

## 公開物件原樣保留

API 沒有用 allowlist 刪減公開樂譜詳情，也沒有額外複製一份 `raw`。上游新增欄位、巢狀作者／檔案／標籤／SEO 資訊、null、價格與免費／付費標記，只要存在都會保留。

下表是欄位範例，不是完整 schema，也不保證每筆上游資料都有這些欄位：

| 欄位 | 處理方式 |
| --- | --- |
| `sheetId` | 必須符合要求的正安全整數 ID |
| `title`、`description` | 保留原文與 description markup，不改寫 |
| `author` | 原樣保留；清單成員必須屬於要求的 `artistUrl` |
| `files`、`tags`、SEO 及未來欄位 | 包含巢狀資料全部保留 |
| `isFree`、`price`、`currency` | 原樣保留，付費作品也包含在內 |
| `createdAt`、`updatedAt` | 保留原始時間字串 |

TypeScript 的 `Sheet` 型別允許未知公開欄位。JSON 屬性順序、空白排版及傳輸位元組不屬於保證範圍。

`updatedAt` 不代表樂譜檔案一定在該時間修改；沒有時區的時間不會擅自轉成 UTC。`meta.fetchedAt` 是另外附上的抓取資訊，不是發布時間。

Description markup 屬於來源資料。若應用程式要當成 HTML 顯示，需自行決定清理方式。

## 網頁網址與 API 網址

| 目的地 | 格式 |
| --- | --- |
| 作者的 MyMusic5 主頁 | `https://www.mymusic5.com/{artistUrl}` |
| 樂譜的 MyMusic5 頁面 | `https://www.mymusic5.com/{artistUrl}/{sheetId}` |
| 自架 API 的樂譜詳情 | `/v1/sheets/{sheetId}` |

組合樂譜網頁網址時，使用回傳的 `author.artistUrl`（若有提供）。`links.self` 指向 API，不是 MyMusic5 網頁。

## 如何抓取完整頁面

1. `POST https://mms.pd.mapia.io/mms/graphql` 取得樂譜 ID、作者歸屬與分頁總數。
2. `GET https://mms.pd.mapia.io/mms/public/sheet/{sheetId}` 取得每筆完整公開詳情。
3. 詳情以有限併發數抓取，回傳陣列維持原本的上游分頁順序。

一頁 N 筆通常需要 **1 + N 次上游請求**，不包含重試。完整走訪不依賴指定作者或固定樂譜數量。

## 完整性檢查

每頁會驗證頁碼、每頁筆數、預期資料數量、ID 唯一性與作者歸屬。完整收集與迭代方法也會拒絕總數變動、跨頁重複 ID，以及尚未完成就達到 `maxPages` 上限。

上游是頁碼分頁，不是原子快照。若資料在走訪途中改變，但總數與已觀察到的成員仍然一致，並非所有變更都能被偵測。操作失敗會拋出錯誤，不會將不完整清單宣告為完整。

程式庫沒有內建快取。呼叫端可以依自己的更新頻率與儲存策略保存成功結果。
