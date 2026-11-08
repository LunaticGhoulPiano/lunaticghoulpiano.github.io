CC4EmbeddedSystem (cc4es for short) is an npm package that converts frontend web assets such as HTML, CSS and JavaScript into `fsdata.c` for HTTP servers on embedded systems using the lightweight TCP/IP stack [lwIP (Lightweight IP)](https://savannah.nongnu.org/projects/lwip/).

cc4es optimizes and compresses these assets with [gzip](https://www.gzip.org/), [Zopfli](https://github.com/google/zopfli) or [Brotli](https://github.com/google/brotli), then writes the HTTP headers and response bodies into C arrays.

## 1. Preparation

### 1.1 Requirements

- Node.js: 22.13.0 or newer
- npm (the version included with your Node.js installation can be used)
- Operating system: Windows, macOS or Linux (the GUI file picker on Linux requires [zenity](https://gitlab.gnome.org/GNOME/zenity))

### 1.2 Installation

- Install globally

    ```sh
    npm install --g cc4-embedded-system@latest
    cc4es --help
    ```

- Launch with npm

    ```sh
    npx cc4-embedded-system
    ```

### 1.3 Settings file location

After the GUI or CLI successfully generates `fsdata.c`, it saves the last source path, output path and compression settings in `cc4es_configs.json`. Commands that do not generate `fsdata.c`, such as displaying help or the settings file path, do not create this file.

To find the location:

```sh
cc4es --config-path
```

| Operating system | Default path |
| --- | --- |
| Windows | `%LOCALAPPDATA%/cc4-embedded-system/cc4es_configs.json` |
| macOS | `~/Library/Application Support/cc4-embedded-system/cc4es_configs.json` |
| Linux | `$XDG_STATE_HOME/cc4-embedded-system/cc4es_configs.json`; if unset, `~/.local/state/cc4-embedded-system/cc4es_configs.json` |

### 1.4 Recommended directory structure

Whether you use Electron, React or another framework, build your frontend before passing it to cc4es. Use the browser-ready output, such as `dist/`. cc4es does not rebuild the project for you. Keep the frontend source files and the generated `fsdata.c` separate.

For example:

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

## 2. Usage

### 2.1 GUI

Start the application. By default, it opens `http://localhost:3000`:

```sh
cc4es
```

To use another port (also available as **GUI Server Port** in the GUI's Advanced Settings):

```sh
cc4es --port 3002
```

#### 2.1.1 Steps

1. Set **Input Directory** to the directory containing your built web assets. Subdirectories are processed too.
2. Set **Output File (fsdata.c)** to a writable C file path, preferably outside the input directory.
3. Expand **Advanced Settings** to adjust optimization options. Under **Compress Algorithm**, choose **Uncompressed**, **gzip**, **Zopfli (gzip)** or **Brotli (br)**.
4. Select **Generate C Code**. **Build progress** shows the current file, processing stage, progress and elapsed time.
5. When generation finishes, check **Build Results** and the output file, then integrate it into your firmware.

Progress updates as files move through each processing stage. Zopfli also reports block and iteration progress. Paths and settings are locked during generation. If a build fails, the GUI shows the error and restores the controls so you can fix the problem and try again.

The default compression setting is **Brotli** with **Quality 11**. gzip shows **gzip level**. Zopfli shows **Iterations** and **gzip level**, which controls its gzip fallback. Brotli shows **Quality**. The GUI restores saved settings when it opens.

Browsers generally require HTTPS for Brotli responses. If the device only serves HTTP, choose gzip or Zopfli. The local GUI's HTTP address and the device that will serve the generated resources are separate services.

#### 2.1.2 Compression results

Both the GUI and CLI display **Build Results** after generation. Sizes are shown in **bytes** and elapsed time in seconds:

| Field | Meaning |
| --- | --- |
| Input resources | Total original size of all input files |
| Content before file compression | Total size of the selected original or optimized content before file compression |
| Content after file compression | Size of the resource bodies written to C arrays, including files left uncompressed |
| Generated C file | Actual size of the generated C source file |
| Resource size reduction / Resource size increase | Change in resource body size relative to the original input, in bytes and as a percentage |
| Generation time | Time taken to generate `fsdata.c` |

`Generated C file` includes textual C declarations and hexadecimal data. It is not the number of bytes written to the MCU. To assess the Flash space required for the resources in `fsdata.c`, check the linked memory regions or the corresponding firmware binary.

### 2.2 CLI

Specify the source (src) and destination (dst) explicitly for repeatable automated builds:

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression none
```

Choose gzip when the client supports it, such as a browser accessing a device over HTTP:

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression gzip --gzip-level 9
```

Choose Brotli when both the client and the environment serving the resources support `br`:

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression brotli --brotli-quality 11
```

For gzip-compatible output with Zopfli, specify the iteration count and gzip fallback level:

```sh
cc4es --headless --src "C:/Project/web" --dst "C:/Project/output/fsdata.c" --compression zopfli --zopfli-iterations 100 --gzip-level 9
```

On macOS or Linux, use paths on that computer, for example:

```sh
cc4es --headless --src "./web" --dst "./output/fsdata.c" --compression none
```

Quote paths containing spaces. If `--dst` points to an existing directory, the application creates `fsdata.c` inside it. If the destination directory does not exist yet, provide the full C filename.

Headless mode does not start the GUI server or open a browser. Failures return a nonzero exit status so an automated build can stop on an error.

The CLI also shows the current file, processing stage, progress and elapsed time, followed by **Build Results**. See **2.1.2 Compression results** for the fields.

Progress and processing messages go to `stderr`; the results summary goes to `stdout`. When redirected, progress is printed on separate lines.

#### 2.2.1 Command reference

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

| Option | Behavior |
| --- | --- |
| No arguments | Start the GUI |
| `-h`, `--help` | Show help and exit |
| `-V`, `--version` | Show the installed application's version and exit |
| `--config-path` | Show the full settings file path and exit |
| `--headless` | Generate resources without starting a server or browser |
| `-s`, `--src`, `--input` | Input directory; requires headless mode |
| `-d`, `--dst`, `--output` | Output C file or existing output directory; requires headless mode |
| `-p`, `--port` | GUI port, from 1 to 65535; unavailable in headless mode |
| `--optimize-svg`, `--no-optimize-svg` | Enable or disable SVG optimization; enabled by default |
| `--svgo-multipass` | Enable multiple SVG optimization passes |
| `--compression` | Select `none`, `gzip`, `brotli` or `zopfli`; defaults to `brotli` |
| `--gzip`, `--no-gzip` | Compatibility aliases selecting `gzip` or `none` |
| `--gzip-level` | Integer from 1 to 9; default 9; also sets the gzip comparison baseline for Zopfli |
| `--brotli-quality` | Integer from 0 to 11; default 11 |
| `--zopfli-iterations` | Integer from 1 to 100; default 15 |

`cc4es --headless` without either a source or destination option is rejected, even if paths were saved previously. If you provide one path, the missing path can use its saved value. If no destination has been saved, the output defaults to `fsdata.c` in the current working directory.

Among `--compression`, `--gzip` and `--no-gzip`, the last algorithm selector wins. Setting only a quality, level or iteration count does not select that algorithm. Omitted settings can reuse saved values. For automated scripts, specify both paths, the compression method and its parameters.

Also, `--compression none` only disables the gzip, Brotli or Zopfli compression step. HTML, CSS and JavaScript can still be optimized, for example by removing unnecessary whitespace or shortening code.

## 3. Optimization

### 3.1 Code minification

Minification removes unnecessary whitespace and comments, or shortens code. For example, CSS such as `body { color: red; }` can become `body{color:red}`. The result is still CSS that a browser can read directly, without decompression.

The application processes files in the input directory and its subdirectories. Each file's extension determines how it is optimized:

| File type | Processing |
| --- | --- |
| `.html`, `.htm` | [html-minifier-next](https://github.com/j9t/html-minifier-next) |
| `.css` | [Lightning CSS](https://lightningcss.dev/); keeps the original content if CSS minification is disabled |
| `.js`, `.mjs` | [esbuild](https://esbuild.github.io/); keeps the original content if JavaScript minification is disabled |
| `.svg` | [SVGO](https://svgo.dev/); keeps the original content if SVG optimization is disabled |
| Other types | Keeps the original content, then checks whether the extension is eligible for file compression |

Processing an already minified file does not always make it smaller. cc4es compares the original content with the minified/optimized content, applies the selected compression method to each, and keeps whichever produces the smaller C output for that file. Identical content is compressed only once.

The GUI runs SVG optimization once. In the CLI, use `--no-optimize-svg` to disable it or `--svgo-multipass` to enable multiple passes.

Each HTML option has a corresponding `--no-` form. The table lists the enabling forms:

| Option | Default | Scope |
| --- | --- | --- |
| `--collapse-whitespace` | On | HTML whitespace |
| `--remove-comments` | On | HTML comments |
| `--minify-js` | On | Inline JavaScript in HTML and external `.js` / `.mjs` files |
| `--minify-css` | On | Inline CSS in HTML and external `.css` files |
| `--decode-entities` | On | HTML character entities |
| `--remove-attribute-quotes` | Off | HTML attribute quotes |
| `--remove-empty-attributes` | Off | Empty HTML attributes |
| `--remove-redundant-attributes` | Off | Redundant HTML attributes |
| `--use-short-doctype` | Off | HTML doctype |
| `--conditional-comments` | Retained for compatibility | This legacy option is not passed to the HTML minifier and has no effect on processing |

For example, keep external JavaScript unchanged while continuing the other processing:

```sh
cc4es --headless --src "./web" --dst "./output/fsdata.c" --no-minify-js --compression none
```

### 3.2 File compression and browser compatibility

[gzip](https://www.gzip.org/), [Brotli](https://github.com/google/brotli) and [Zopfli](https://github.com/google/zopfli) attempt to reduce the resource size further. This step produces compressed data, which the browser must decompress before reading the HTML, CSS or JavaScript inside.

cc4es writes the selected content into `fsdata.c`. **`--compression none` skips only this second step; the first step, code minification, still runs.**

#### 3.2.1 Choosing a compression method

| `--compression` option | Parameters | What the browser receives |
| --- | --- | --- |
| `none` | None | Content that can be read directly without decompression |
| `gzip` | `--gzip-level`: 1–9, default 9 | gzip data; requires gzip decompression support |
| `brotli` | `--brotli-quality`: 0–11, default 11 | Brotli data; requires Brotli decompression support |
| `zopfli` | `--zopfli-iterations`: 1–100, default 15; `--gzip-level`: 1–9, default 9 | Also gzip data; gzip support is sufficient |

Zopfli is another way to produce gzip data. Browsers do not need a separate Zopfli decoder. cc4es compares the Zopfli result with ordinary gzip and keeps the smaller result. Here, `--gzip-level` controls the gzip compression level used for that comparison. More Zopfli iterations take longer and do not guarantee a smaller file every time.

#### 3.2.2 Compatibility notes

This compression step applies to `.html`, `.htm`, `.css`, `.js`, `.mjs`, `.json`, `.svg`, `.xml`, `.txt` and `.map`. Other file types are not compressed. Even when a compression method is selected, cc4es uses the compressed result only if it is smaller; otherwise, it keeps the content from before file compression.

Each file is written once. The device does not switch to a separate uncompressed copy based on the browser's supported formats, so choose a suitable method before generation:

- **The device serves pages over ordinary HTTP**, for example `http://192.168.1.100/`: choose gzip or Zopfli. The browser only needs gzip support.
- **The device serves pages over HTTPS and the browser supports Brotli**: Brotli is an option. For ordinary remote sites, mainstream browsers generally enable Brotli only over HTTPS. Do not assume a browser can handle Brotli responses when accessing the device over HTTP.
- **The client cannot decompress responses, or needs the web code directly**: choose `--compression none`.

What matters is the URL **the browser uses to access the device's web page**. The local cc4es GUI at `http://localhost:3000` is only the tool's interface; it does not determine whether the device serves its pages over HTTP or HTTPS.

Once the device is serving the pages, test it from your computer:

```sh
curl --compressed http://DEVICE_IP/app.js
```

Replace `DEVICE_IP` and `app.js` with the device address and resource path. `--compressed` makes curl decompress the response before displaying its content. To confirm browser compatibility, also open the page at the actual device URL.

### 3.3 Performance comparison

The [demo/](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/tree/master/V3/demo) compares four modes using three web frontends used in real embedded systems.

- **Raw**: no code minification, optimization or compression; converts the input directly into `fsdata.c`.
- **gzip** / **Brotli** / **Zopfli**: enables all available code minification and optimization, then uses each algorithm's highest compression settings.

The three compressed modes compare direct compression of the original file with compression after minification and optimization. Each file uses whichever produces the smaller C output. Identical content is compressed only once.

Percentages in parentheses show the size reduction relative to Raw C. The last value in each mode's column is the generation time in seconds. Timing includes minification, optimization, compression comparisons and C file generation, but excludes building the frontend projects.

| Project | Demo source commit | Input resources | Raw | gzip | Brotli | Zopfli |
| --- | --- | --- | --- | --- | --- | --- |
| [DuetWebControl](https://github.com/Duet3D/DuetWebControl) | [92bb294](https://github.com/Duet3D/DuetWebControl/commit/92bb294cf4cab136aac4196a952e5f3ba359ad74) | 29 files /<br>19,223,734 B | 98,566,679 B<br>(1.56 s) | 37,714,085 B<br>(-61.74%, 4.04 s) | 33,423,164 B<br>(-66.09%, 50.68 s) | 36,900,937 B<br>(-62.56%, 463.40 s) |
| [ESP3D-WEBUI](https://github.com/luc-github/ESP3D-WEBUI) | [b6f501c](https://github.com/luc-github/ESP3D-WEBUI/commit/b6f501c3f91399440ead562d3ce9ce10f9ae5559) | 2 files /<br>365,714 B | 1,877,411 B<br>(0.03 s) | 491,736 B<br>(-73.81%, 1.35 s) | 409,141 B<br>(-78.21%, 1.06 s) | 471,836 B<br>(-74.87%, 17.33 s) |
| [WLED](https://github.com/wled/WLED) | [29b389d](https://github.com/wled/WLED/commit/29b389df1c1aaec6ff53aea742d17063b985906c) | 29 files /<br>389,310 B | 2,033,626 B<br>(0.03 s) | 743,350 B<br>(-63.45%, 1.04 s) | 646,619 B<br>(-68.20%, 1.03 s) | 722,297 B<br>(-64.48%, 14.60 s) |

Ranked by output file size, the compression results are: **Brotli** > **Zopfli** > **gzip** > **Raw**.

Each mode is defined in [demo/projects.mjs](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/blob/master/V3/demo/projects.mjs):

| Mode | Output file | Optimization settings | Compression parameters |
| --- | --- | --- | --- |
| Raw | `fsdata_raw.c` | Minification and SVG optimization disabled | `compression: 'none'` |
| gzip | `fsdata_gzip_level9.c` | All minification options enabled; SVG multipass | `compression: 'gzip', gzipLevel: 9` |
| Brotli | `fsdata_brotli_quality11.c` | All minification options enabled; SVG multipass | `compression: 'brotli', brotliQuality: 11` |
| Zopfli | `fsdata_zopfli_iterations100.c` | All minification options enabled; SVG multipass | `compression: 'zopfli', zopfliIterations: 100, gzipLevel: 9` |

Raw uses `minifyOpts: false`, `optimizeSvg: false` and `svgoMultipass: false`. The other three modes set all effective HTML minification options listed above in `minifyOpts` to `true`, including inline and external JavaScript and CSS minification, and set `optimizeSvg: true` and `svgoMultipass: true`.

The shared generator options in [demo/build.mjs](https://github.com/LunaticGhoulPiano/CC4EmbeddedSystem/blob/master/V3/demo/build.mjs) are:

```js
{
    processSubs: true,
    includeHttpHeader: true,
    useHttp11: true,
    supportSsi: false,
    precalcChksum: false
}
```

The demo uses HTTP/1.1 headers; normal GUI and CLI generation uses HTTP/1.0.

If the three projects' submodules and required dependencies are already available in your checkout, run from `V3/`:

```sh
npm run demo:prepare
npm run demo:build
npm run demo:test
```

The tests check that Raw preserves every input byte, each compression mode decompresses correctly, and the HTTP response headers are correct. HTML, CSS, JavaScript and SVG samples also verify that minification and optimization actually run.

## 4. Integrating with lwIP firmware

After adding the generated `fsdata.c` to your firmware project, rebuild and flash the firmware so the device's lwIP HTTP server can serve the web assets.

1. Use cc4es to generate `fsdata.c` from the built frontend assets.
2. Place `fsdata.c` in the firmware project's web resource directory. Include or compile it using the project's existing approach.
3. Check how the firmware handles HTTP response headers. If the generated resources already contain headers, the HTTP server should recognize `FS_FILE_FLAGS_HEADER_INCLUDED` and avoid adding them again.
4. Rebuild and flash the firmware, then open the device's web page and check that HTML, JavaScript, CSS and images load correctly.
5. Confirm that the browser can decompress the resources. gzip and Zopfli use `Content-Encoding: gzip`; Brotli uses `Content-Encoding: br`. For Brotli, also check that the device connection meets the browser's HTTPS requirements.

The C resource structures in cc4es are based on [lwIP makefsdata](https://github.com/m-labs/lwip/tree/master/src/apps/httpd/makefsdata). When integrating with a different lwIP version or a customized project, check that the generated data matches the firmware's `struct fsdata_file` fields and build configuration.

### 4.1 Special handling of `redirhome.html`

`file__redirhome_html` is the name of a C resource node in `fsdata.c`. cc4es preserves this name so existing firmware code that references it directly can continue to use it.

The result depends on whether the input directory contains `redirhome.html`:

| Input | Generated behavior |
| --- | --- |
| Includes `redirhome.html` | Creates the `file__redirhome_html` node from this HTML file, places it at the start of the resource list and points `FS_ROOT` to it |
| No `redirhome.html` | Keeps an empty node with the same C name at the end of the resource list; its resource path is empty, its content length is 0 and `next == NULL` |

When `redirhome.html` is absent, the empty node still counts toward `FS_NUMFILES`. This makes the count one greater than the number of input files, but does not create a `/redirhome.html` page on the device.

This handling does not automatically create a redirect. Even if `redirhome.html` is provided, any redirect behavior depends on the HTML content.
