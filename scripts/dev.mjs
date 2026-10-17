import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { projectRoot } from "../src/config/runtime.mjs";
import { refreshDevelopmentData, refreshInterval } from "./github/update.mjs";
import { validationEnvironment } from "./github/environment.mjs";
import { astroArguments } from "./astro/run.mjs";

async function startDevelopment() {
    let pending;
    const refresh = () => {
        if (pending) return pending;
        pending = refreshDevelopmentData()
            .catch((error) => console.warn(`[GitHub] ${error.message} Existing data remains available.`))
            .finally(() => {
                pending = undefined;
            });
        return pending;
    };
    await refresh();
    const timer = setInterval(refresh, refreshInterval);
    const environment = validationEnvironment(undefined);
    const child = spawn(process.execPath, astroArguments("dev", ...process.argv.slice(2)), {
        cwd: projectRoot,
        stdio: "inherit",
        env: environment,
    });
    const stop = () => {
        clearInterval(timer);
        child.kill();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", () => {
        clearInterval(timer);
        console.error("Unable to start the installed Astro development server.");
        process.exitCode = 1;
    });
    child.once("exit", (code) => {
        clearInterval(timer);
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        process.exitCode = code ?? 0;
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startDevelopment();
