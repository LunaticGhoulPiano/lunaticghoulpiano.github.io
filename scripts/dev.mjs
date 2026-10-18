import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { projectRoot } from "../src/config/runtime.mjs";
import * as github from "./github/update.mjs";
import * as youtube from "./youtube/update.mjs";
import { validationEnvironment } from "./github/environment.mjs";
import { astroArguments } from "./astro/run.mjs";

async function startDevelopment() {
    const timers = await Promise.all(Object.entries({ GitHub: github, YouTube: youtube }).map(async ([name, source]) => {
        let pending;
        const refresh = () => {
            if (pending) return pending;
            pending = source.refreshDevelopmentData()
                .catch((error) => console.warn(`[${name}] ${error.message} Existing data remains available.`))
                .finally(() => {
                    pending = undefined;
                });
            return pending;
        };
        await refresh();
        return setInterval(refresh, source.refreshInterval);
    }));
    const clearTimers = () => timers.forEach(clearInterval);
    const environment = validationEnvironment(undefined);
    const child = spawn(process.execPath, astroArguments("dev", ...process.argv.slice(2)), {
        cwd: projectRoot,
        stdio: "inherit",
        env: environment,
    });
    const stop = () => {
        clearTimers();
        child.kill();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", () => {
        clearTimers();
        console.error("Unable to start the installed Astro development server.");
        process.exitCode = 1;
    });
    child.once("exit", (code) => {
        clearTimers();
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        process.exitCode = code ?? 0;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startDevelopment();
