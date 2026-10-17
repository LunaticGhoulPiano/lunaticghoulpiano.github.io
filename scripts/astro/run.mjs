import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "../../src/config/runtime.mjs";
import { astroExecutable } from "../runtime.mjs";

export function astroArguments(command, ...options) {
    return [astroExecutable, command, "--config", "scripts/astro/config.ts", ...options];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const result = spawnSync(process.execPath, astroArguments(...process.argv.slice(2)), {
        cwd: projectRoot,
        stdio: "inherit",
    });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
}
