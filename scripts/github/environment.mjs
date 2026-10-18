import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { projectRoot } from "../../src/config/runtime.mjs";

export function validationEnvironment(stage, source = process.env) {
    const environment = {
        ...source,
        ASTRO_TELEMETRY_DISABLED: "1",
        COREPACK_ENABLE_NETWORK: "0",
    };
    for (const key of ["WEBPAGE_GITHUB_PROFILE_READONLY", "GH_PROFILE_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]) delete environment[key];
    if (stage === undefined) delete environment.GITHUB_SNAPSHOT_DIR;
    else environment.GITHUB_SNAPSHOT_DIR = stage;
    return environment;
}

export function githubReadToken(directory = projectRoot, environment = process.env) {
    if (environment.WEBPAGE_GITHUB_PROFILE_READONLY) return environment.WEBPAGE_GITHUB_PROFILE_READONLY;
    for (const filename of [".env.local", ".env"]) {
        try {
            const values = parseEnv(readFileSync(resolve(directory, filename), "utf8"));
            if (values.WEBPAGE_GITHUB_PROFILE_READONLY) return values.WEBPAGE_GITHUB_PROFILE_READONLY;
        }
        catch (error) {
            if (error.code !== "ENOENT") throw new Error(`Cannot read GitHub credential from ${filename}.`);
        }
    }
    return undefined;
}
