import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packagePath = require.resolve("@docusaurus/core/package.json");
const packageData = JSON.parse(readFileSync(packagePath, "utf8"));
const executable = resolve(dirname(packagePath), packageData.bin.docusaurus);
const content = JSON.parse(readFileSync(new URL("./configs.json", import.meta.url), "utf8"));
const { values } = parseArgs({ options: { locale: { type: "string" }, "out-dir": { type: "string" } } });
if (values.locale && ! content.locales[values.locale]) throw new Error(`Unknown locale: ${values.locale}`);
if (values["out-dir"] && ! values.locale) throw new Error("--out-dir requires --locale.");

for (const [locale, { entry }] of Object.entries(content.locales)) {
    if (values.locale && values.locale !== locale) continue;
    const result = spawnSync(process.execPath, [executable, "build", "--locale", locale, "--out-dir", values["out-dir"] ?? entry.root], {
        cwd: root,
        stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
    }
}
