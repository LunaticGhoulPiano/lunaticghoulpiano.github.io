CC4EmbeddedSystem（下稱 cc4es）是一個 npm 套件，可將 HTML、CSS、JavaScript 等前端網頁資源轉換為 `fsdata.c`，供嵌入式系統中採用輕量級 TCP/IP 協定堆疊 [lwIP (Lightweight IP)](https://savannah.nongnu.org/projects/lwip/) 的 HTTP 伺服器使用。

cc4es 可透過 [gzip](https://www.gzip.org/), [zopfli](https://github.com/google/zopfli), 或 [brotli](https://github.com/google/brotli) 將前端資源進行最佳化壓縮後，再把 HTTP header 與回應內容寫入 C 陣列。

## 1. 前置準備

### 1.1 環境需求

- Node.js: 22.13.0 或以上
- npm （可使用安裝 Node.js 時的配套版本）
- 作業系統：Windows, macOS, Linux （Linux 使用 GUI 時檔案選擇器需要 [zenity](https://gitlab.gnome.org/GNOME/zenity)）

### 1.2 安裝

- 全域安裝

    ```sh
    npm install --g cc4-embedded-system@latest
    cc4es --help
    ```

- 透過 npm 啟動

    ```sh
    npx cc4-embedded-system
    ```

### 1.3 設定保存路徑

GUI 或 CLI 成功輸出後，會把最後使用的來源、輸出與壓縮設定保存為 `cc4es_configs.json`。顯示說明、列出設定檔路徑等未輸出 `fsdata.c` 的操作，都不會建立這個檔案。

查詢路徑：

```sh
cc4es --config-path
```

| 作業系統 | 預設路徑 |
| --- | --- |
| Windows | `%LOCALAPPDATA%/cc4-embedded-system/cc4es_configs.json` |
| macOS | `~/Library/Application Support/cc4-embedded-system/cc4es_configs.json` |
| Linux | `$XDG_STATE_HOME/cc4-embedded-system/cc4es_configs.json`；未設定時使用 `~/.local/state/cc4-embedded-system/cc4es_configs.json` |

### 1.4 建議架構

無論是否使用 Electron, React 等框架，使用 cc4es 之前請先編譯建置好你的前端，例如 `dist/` 。cc4es 不會預先重新編譯建置整個專案。建議把前端原始碼與 `fsdata.c` 分開。

例如：

```text
./Web/
│   ├── src/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── style.css
│   │   └── images/
│   │       └── logo.svg
│   └── dst/
│       └── fsdata.c
...
```
## 2. 使用

### 2.1 GUI

啟動程式，預設開啟 `http://localhost:3000`：

```sh
cc4es
```

若要指定其他 port （GUI 的 Advanced Settings 也提供 **GUI Server Port** 設定）：

```sh
cc4es --port 3002
```

#### 2.1.1 操作步驟

1. 在 **Input Directory** 指定已完成建置的網頁資源目錄，子目錄也會一起處理。
2. 在 **Output File (fsdata.c)** 指定可寫入的 C 檔路徑，建議放在來源目錄之外。
3. 展開 **Advanced Settings** 調整最佳化選項，並在 **Compress Algorithm** 選擇 **Uncompressed**、**gzip**、**Zopfli (gzip)** 或 **Brotli (br)**。
4. 按下 **Generate C Code**，**Build progress** 會顯示目前檔案、處理階段、進度與耗時。
5. 完成後查看 **Build Results**，確認產生的檔案，再將產物整合進韌體。

進度會依檔案與處理階段更新，Zopfli 另會回報區塊與迭代進度。產生期間不能修改路徑與設定；若失敗，會顯示錯誤並恢復操作，修正後即可重新執行。

最佳化壓縮設定預設選擇 **Brotli**，**Quality** 為 **11**。gzip 會顯示 **gzip level**；Zopfli 顯示 **Iterations** 與控制 gzip 回退 (fallback) 結果的 **gzip level**；Brotli 則顯示 **Quality**。GUI 開啟時會還原已保存的設定。

瀏覽器通常要求透過 HTTPS 接收 Brotli 回應。若裝置介面只提供 HTTP，請選擇 gzip 或 Zopfli。本機 GUI 的 HTTP 位址，與之後實際提供這些資源的裝置是不同的服務。

#### 2.1.2 壓縮結果內容說明

GUI 與 CLI 完成後都會列出 **Build Results**，大小以 **bytes** 表示，耗時則以秒表示：

| 欄位 | 意思 |
| --- | --- |
| Input resources | 所有輸入檔案的原始大小總和 |
| Content before file compression | 各檔案選用原始或最佳化內容後，尚未進行檔案壓縮的大小總和 |
| Content after file compression | 最後寫入 C 陣列的資源內容大小，包含未壓縮的檔案 |
| Generated C file | 產生的 C 原始碼檔案實際大小 |
| Resource size reduction / Resource size increase | 資源內容相對原始輸入減少或增加的 bytes 與比例 |
| Generation time | 產生 `fsdata.c` 所需的時間 |

`Generated C file` 包含文字形式的 C 宣告與十六進位資料，不等於實際寫入 MCU 的位元組數。評估嵌入式設備上 flash 燒錄 `fsdata.c` 所需大小之前，應查看連結後的記憶體區段或對應的韌體 binary 。

### 2.2 CLI

明確指定來源 (src) 與輸出 (dst) ，方便套用自動化流程重複執行：

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression none
```

用戶端支援 gzip 時可選擇 gzip，例如透過 HTTP 存取裝置的瀏覽器：

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression gzip --gzip-level 9
```

用戶端與實際提供資源的環境支援 `br` 時，可選擇 Brotli：

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression brotli --brotli-quality 11
```

需要 gzip 相容輸出時，可選擇 Zopfli，明確指定迭代次數與 gzip fallback 等級：

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression zopfli --zopfli-iterations 100 --gzip-level 9
```

macOS 或 Linux 則使用該電腦上的路徑，例如：

```sh
cc4es --headless --src "./web" --dst "./output/fsdata.c" --compression none
```

包含空白的路徑要加引號，若 `--dst` 指向已存在的目錄，程式會在該目錄產生 `fsdata.c`；目標目錄尚不存在時，請提供完整的 C 檔名稱。

Headless 模式不啟動 GUI server 或瀏覽器。執行失敗會回傳非零錯誤代號 (exit status)，方便自動化建置流程在錯誤時停止。

CLI 也會顯示目前檔案、處理階段、進度與耗時，完成後列出 **Build Results**，欄位說明同 **2.1.2 壓縮結果內容說明**。

進度與處理訊息輸出至 `stderr`，結果摘要輸出至 `stdout`。進度輸出重新導向時，會改成逐行列出。

#### 2.2.1 命令參數

```text
cc4es --help
Usage: cc4es [options]

Without options, starts the browser GUI.

  -h, --help                         Show this help and exit
  -V, --version                      Show version and exit
  --config-path                      Print the full config file path and exit
  --headless                         Build without server or browser
  -s, --src <directory>              Source directory (headless)
  -d, --dst <file|directory>         Output C file or directory (default: fsdata.c)
  -p, --port <1-65535>               GUI server port
  --[no-]optimize-svg                Enable or disable SVGO (default: enabled)
  --svgo-multipass                   Run SVGO optimization repeatedly
  --[no-]gzip                        Select gzip storage, or none with --no-gzip
  --gzip-level <1-9>                 gzip compression level (default: 9)
  --compression <method>             Storage: none, gzip, brotli or zopfli (default: brotli)
  --brotli-quality <0-11>             Brotli quality (default: 11)
  --zopfli-iterations <1-100>         Zopfli iterations (default: 15; gzip-compatible output)
  Brotli requires br-capable clients; browsers generally require HTTPS.
  Stored encodings are fixed; no runtime Accept-Encoding negotiation.
  Compression switches use the last one supplied; omitted options use saved settings.

HTML compression options:
  --[no-]collapse-whitespace         --[no-]remove-comments
  --[no-]minify-js                   --[no-]minify-css
  --[no-]conditional-comments        --[no-]decode-entities
  --[no-]remove-attribute-quotes     --[no-]remove-empty-attributes
  --[no-]remove-redundant-attributes --[no-]use-short-doctype

Headless mode requires --src or --dst and never reruns the last build with
no path options. A missing counterpart uses the last saved path; if no
destination is saved, fsdata.c is created in the current working directory.
```

| 選項 | 行為 |
| --- | --- |
| 不帶參數 | 啟動 GUI |
| `-h`、`--help` | 顯示說明後結束 |
| `-V`、`--version` | 顯示已安裝程式的版本後結束 |
| `--config-path` | 顯示設定檔完整路徑後結束 |
| `--headless` | 不啟動 server 或瀏覽器，直接產生資源 |
| `-s`、`--src`、`--input` | 來源目錄，必須搭配 headless 模式 |
| `-d`、`--dst`、`--output` | 輸出 C 檔或已存在的輸出目錄，必須搭配 headless 模式 |
| `-p`、`--port` | GUI port，範圍為 1 至 65535，不能用於 headless 模式 |
| `--optimize-svg`、`--no-optimize-svg` | 開啟或關閉 SVG 最佳化，預設開啟 |
| `--svgo-multipass` | 啟用 SVG 多次最佳化 |
| `--compression` | 選擇 `none`、`gzip`、`brotli` 或 `zopfli`，預設為 `brotli` |
| `--gzip`、`--no-gzip` | 相容別名，分別選擇 `gzip` 或 `none` |
| `--gzip-level` | 1 至 9 的整數，預設為 9；也控制 Zopfli 使用的 gzip 比較基準 |
| `--brotli-quality` | 0 至 11 的整數，預設為 11 |
| `--zopfli-iterations` | 1 至 100 的整數，預設為 15 |

即使已保存先前路徑，只有 `cc4es --headless`、沒有任一來源或輸出選項時，程式仍會拒絕執行。提供其中一個路徑選項時，缺少的另一個可使用已保存路徑；未保存輸出路徑時，則預設寫入目前工作目錄的 `fsdata.c`。

`--compression`、`--gzip` 與 `--no-gzip` 以最後出現的演算法選擇為準。單獨指定 quality、level 或 iterations 不會切換對應演算法，省略的設定則可沿用已保存值。自動化腳本建議同時提供兩個路徑、壓縮演算法及其參數。

並且，`--compression none` 只會關閉 gzip、Brotli、Zopfli 這一層壓縮。
HTML、CSS、JavaScript 等檔案仍會進行最佳化，例如移除多餘空白、縮短程式碼。

## 3. 最佳化

### 3.1 程式碼精簡化

移除多餘的空白、註解，或縮短程式碼的寫法。例如 CSS 的 `body { color: red; }` 可以精簡成 `body{color:red}`。處理後仍然是 CSS，瀏覽器可以直接讀取，不需要解壓縮。

程式處理輸入目錄及子目錄中的檔案，由副檔名決定最佳化方式：

| 檔案類型 | 處理方式 |
| --- | --- |
| `.html`、`.htm` | [html-minifier-next](https://github.com/j9t/html-minifier-next) |
| `.css` | [Lightning CSS](https://lightningcss.dev/)；關閉 CSS 壓縮時保留原始內容 |
| `.js`、`.mjs` | [esbuild](https://esbuild.github.io/)；關閉 JavaScript 壓縮時保留原始內容 |
| `.svg` | [SVGO](https://svgo.dev/)；關閉 SVG 最佳化時保留原始內容 |
| 其他類型 | 先保留原始內容，再依副檔名判斷是否適用檔案壓縮 |

已經精簡過的檔案，再處理一次不一定會變小。cc4es 會比較原始內容與精簡、最佳化後的內容，連同選定的壓縮方式計算 C 輸出大小，逐檔保留較小者；內容相同時只壓縮一次。

GUI 的 SVG 最佳化採單次處理。CLI 可用 `--no-optimize-svg` 關閉，或用 `--svgo-multipass` 改為多次最佳化。

HTML 選項都有對應的 `--no-` 形式，以下列出啟用形式：

| 選項 | 預設 | 作用範圍 |
| --- | --- | --- |
| `--collapse-whitespace` | 開啟 | HTML 空白 |
| `--remove-comments` | 開啟 | HTML 註解 |
| `--minify-js` | 開啟 | HTML 行內 JavaScript 與外部 `.js` / `.mjs` |
| `--minify-css` | 開啟 | HTML 行內 CSS 與外部 `.css` |
| `--decode-entities` | 開啟 | HTML 字元實體 |
| `--remove-attribute-quotes` | 關閉 | HTML 屬性引號 |
| `--remove-empty-attributes` | 關閉 | 空白的 HTML 屬性 |
| `--remove-redundant-attributes` | 關閉 | 多餘的 HTML 屬性 |
| `--use-short-doctype` | 關閉 | HTML doctype |
| `--conditional-comments` | 保留相容選項 | 此舊選項不會傳給 HTML minifier，不影響實際處理 |

例如，保留外部 JavaScript 原始內容，同時繼續其他處理：

```sh
cc4es --headless --src "./web" --dst "./output/fsdata.c" --no-minify-js --compression none
```

### 3.2 檔案壓縮與壓縮格式對瀏覽器的相容性

使用 [gzip](https://www.gzip.org/)、[Brotli](https://github.com/google/brotli) 或 [Zopfli](https://github.com/google/zopfli)，嘗試把資源內容再縮小。這次產生的是壓縮後的資料，瀏覽器必須先解壓縮，才能讀取裡面的 HTML、CSS 或 JavaScript。

cc4es 會把最後選用的內容寫入 `fsdata.c`。因此，**`--compression none` 只會略過第二步，第一步的程式碼精簡仍會執行**。

#### 3.2.1 選擇壓縮方式

| `--compression` 選項 | 可調整的參數 | 瀏覽器收到的內容 |
| --- | --- | --- |
| `none` | 無 | 無須解壓縮，可直接讀取 |
| `gzip` | `--gzip-level`：1–9，預設 9 | gzip 格式，需支援 gzip 解壓縮 |
| `brotli` | `--brotli-quality`：0–11，預設 11 | Brotli 格式，需支援 Brotli 解壓縮 |
| `zopfli` | `--zopfli-iterations`：1–100，預設 15；`--gzip-level`：1–9，預設 9 | 同樣是 gzip 格式，支援 gzip 即可 |

Zopfli 是另一種產生 gzip 資料的方法，瀏覽器不需要另外支援「Zopfli 解壓縮」。cc4es 會將 Zopfli 的結果與一般 gzip 的結果比較，保留較小者；這裡的 `--gzip-level` 就是用來設定比較時的 gzip 壓縮程度。提高 Zopfli 的迭代次數會增加產生時間，不保證每次都能讓檔案更小。

#### 3.2.2 注意事項

這一步適用的副檔名為 `.html`、`.htm`、`.css`、`.js`、`.mjs`、`.json`、`.svg`、`.xml`、`.txt` 與 `.map`，其他類型不進行這一步壓縮。即使選了壓縮方式，cc4es 也只會在壓縮後確實變小時使用壓縮結果；如果沒有更小，就保留該檔案壓縮前的內容。


每個檔案只會寫入一份內容。裝置不會根據瀏覽器支援的格式，自動切換成另一份未壓縮的內容，因此產生前就要選好適合的方式：

- **裝置網頁使用一般 HTTP**，例如 `http://192.168.1.100/`：選擇 gzip 或 Zopfli，瀏覽器支援 gzip 即可解壓縮。
- **裝置網頁使用 HTTPS，且瀏覽器支援 Brotli**：可以選擇 Brotli。主流瀏覽器對一般遠端網站通常只在 HTTPS 下啟用 Brotli，直接用 HTTP 存取裝置時，不應假設瀏覽器也能處理 Brotli 回應。
- **用戶端不支援解壓縮，或需要直接取得網頁程式碼**：選擇 `--compression none`。

這裡要看的是**瀏覽器存取裝置網頁**時使用的網址。cc4es 本機 GUI 的 `http://localhost:3000` 只是操作工具的介面，與裝置最後用 HTTP 還是 HTTPS 提供網頁無關。

裝置開始提供網頁後，可以從電腦測試：

```sh
curl --compressed http://DEVICE_IP/app.js
```

請將 `DEVICE_IP` 與 `app.js` 換成實際裝置位址和檔案路徑。`--compressed` 會讓 curl 自動解壓縮收到的壓縮回應，再顯示檔案內容；瀏覽器是否能正常使用，仍應以實際裝置網址開啟網頁確認。

### 3.3 效能比較

在 [demo/](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/tree/master/V3/demo) 中使用三個實務上使用的嵌入式系統前端網頁，對四種模式進行效能比較。

- **Raw**：不做程式碼精簡與最佳化、不壓縮，直接轉成 `fsdata.c`。
- **gzip** / **Brotli** / **Zopfli**：開啟所有可用的程式碼精簡與最佳化，再使用各演算法的最高壓縮設定。

後三種模式都會比較「原檔直接壓縮」與「精簡、最佳化後再壓縮」的結果，逐檔選擇 C 輸出較小的一種；內容相同時只壓縮一次。

表中括號為相對 Raw C 的大小減少比例，各模式欄位最後的秒數為產生耗時。計時包含精簡、最佳化、壓縮比較與 C 檔產生，不含專案編譯建置。

| 專案 | Demo 使用來源之 commit | 輸入資源 | Raw | gzip | Brotli | Zopfli |
| --- | --- | --- | --- | --- | --- | --- |
| [DuetWebControl](https://github.com/Duet3D/DuetWebControl) | [92bb294](https://github.com/Duet3D/DuetWebControl/commit/92bb294cf4cab136aac4196a952e5f3ba359ad74) | 29 個檔案 /<br>19,223,734 B | 98,566,679 B<br>(1.56 s) | 37,714,085 B<br>(-61.74%, 4.04 s) | 33,423,164 B<br>(-66.09%, 50.68 s) | 36,900,937 B<br>(-62.56%, 463.40 s) |
| [ESP3D-WEBUI](https://github.com/luc-github/ESP3D-WEBUI) | [b6f501c](https://github.com/luc-github/ESP3D-WEBUI/commit/b6f501c3f91399440ead562d3ce9ce10f9ae5559) | 2 個檔案 /<br>365,714 B | 1,877,411 B<br>(0.03 s) | 491,736 B<br>(-73.81%, 1.35 s) | 409,141 B<br>(-78.21%, 1.06 s) | 471,836 B<br>(-74.87%, 17.33 s) |
| [WLED](https://github.com/wled/WLED) | [29b389d](https://github.com/wled/WLED/commit/29b389df1c1aaec6ff53aea742d17063b985906c) | 29 個檔案 /<br>389,310 B | 2,033,626 B<br>(0.03 s) | 743,350 B<br>(-63.45%, 1.04 s) | 646,619 B<br>(-68.20%, 1.03 s) | 722,297 B<br>(-64.48%, 14.60 s) |

以輸出檔大小為基準，壓縮效能排名為：**Brotli** > **Zopfli** > **gzip** > **Raw**。

各模式的設定由 [demo/projects.mjs](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/blob/master/V3/demo/projects.mjs) 定義：

| 模式 | 輸出檔案 | 最佳化設定 | 壓縮參數 |
| --- | --- | --- | --- |
| Raw | `fsdata_raw.c` | 精簡與 SVG 最佳化全部關閉 | `compression: 'none'` |
| gzip | `fsdata_gzip_level9.c` | 精簡選項全開、SVG 多輪最佳化 | `compression: 'gzip', gzipLevel: 9` |
| Brotli | `fsdata_brotli_quality11.c` | 精簡選項全開、SVG 多輪最佳化 | `compression: 'brotli', brotliQuality: 11` |
| Zopfli | `fsdata_zopfli_iterations100.c` | 精簡選項全開、SVG 多輪最佳化 | `compression: 'zopfli', zopfliIterations: 100, gzipLevel: 9` |

Raw 使用 `minifyOpts: false`、`optimizeSvg: false`、`svgoMultipass: false`。另外三組將 `minifyOpts` 中前文列出的有效 HTML 精簡選項全部設為 `true`，包含行內與外部 JavaScript、CSS 的精簡，並設定 `optimizeSvg: true`、`svgoMultipass: true`。

[demo/build.mjs](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/blob/master/V3/demo/build.mjs) 使用的共用產生器參數為：

```js
{
    processSubs: true,
    includeHttpHeader: true,
    useHttp11: true,
    supportSsi: false,
    precalcChksum: false
}
```

Demo 使用 HTTP/1.1 header，一般 GUI 與 CLI 產生流程則使用 HTTP/1.0。

若原始碼 checkout 已配置好三個專案對應的 submodule 與所需套件，可在 `V3/` 執行：

```sh
npm run demo:prepare
npm run demo:build
npm run demo:test
```

測試會確認 Raw 完整保留輸入資源、各壓縮模式均可正確解壓縮，並檢查 HTTP 回應標頭；另以 HTML、CSS、JavaScript 與 SVG 樣本驗證精簡及最佳化確實執行。

## 4. 整合進 lwIP 韌體

將 cc4es 產生的 `fsdata.c` 加入韌體專案後，還需要重新編譯與燒錄韌體，才能由裝置的 lwIP HTTP server 提供網頁資源。

1. 將完成建置的前端資源交給 cc4es，產生 `fsdata.c`。
2. 將 `fsdata.c` 放到韌體專案存放網頁資源的位置，依專案原本的方式引入或編譯這份檔案。
3. 確認韌體對 HTTP 回應標頭的處理方式。若產生的資源已包含標頭，HTTP server 應依 `FS_FILE_FLAGS_HEADER_INCLUDED` 旗標識別，避免重複加入標頭。
4. 重新編譯並燒錄韌體，開啟裝置網頁，確認 HTML、JavaScript、CSS 與圖片都能正常載入。
5. 確認瀏覽器能正確解壓縮資源。gzip 與 Zopfli 使用 `Content-Encoding: gzip`，Brotli 使用 `Content-Encoding: br`；使用 Brotli 時，還要確認裝置的連線方式符合瀏覽器對 HTTPS 的要求。

cc4es 的 C 資源結構以 [lwIP makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata) 為基礎。整合到不同版本或客製化的 lwIP 專案時，請確認產生的資料符合韌體使用的 `struct fsdata_file` 欄位定義與編譯設定。

### 4.1 `redirhome.html` 的特殊處理

`file__redirhome_html` 是 `fsdata.c` 中的 C 資源節點名稱。cc4es 會保留這個名稱，讓既有韌體中直接引用它的程式碼仍能使用。

依來源資料夾是否包含 `redirhome.html`，會有以下兩種結果：

| 輸入內容 | 產生行為 |
| --- | --- |
| 包含 `redirhome.html` | 以這份 HTML 建立 `file__redirhome_html` 節點，放在資源串列開頭，並讓 `FS_ROOT` 指向它 |
| 沒有 `redirhome.html` | 在資源串列結尾保留同名的空節點；資源路徑為空、內容長度為 0，且 `next == NULL` |

未提供 `redirhome.html` 時，空節點也會計入 `FS_NUMFILES`，因此這個數值會比實際輸入的檔案數多 1，但裝置上不會因此多出 `/redirhome.html` 頁面。

這項處理不會自動產生重新導向功能。即使提供了 `redirhome.html`，是否重新導向仍由該 HTML 的內容決定。
