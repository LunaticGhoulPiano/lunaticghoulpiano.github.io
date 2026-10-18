import { projectRoot } from "../../src/config/runtime.mjs";
import { readCredential } from "../environment.mjs";

export function validationEnvironment(stage, source = process.env) {
    const environment = {
        ...source,
        ASTRO_TELEMETRY_DISABLED: "1",
        COREPACK_ENABLE_NETWORK: "0",
    };
    for (const key of ["WEBPAGE_GITHUB_PROFILE_READONLY", "WEBPAGE_YOUTUBE_PROFILE_READONLY", "GH_PROFILE_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]) delete environment[key];
    if (stage === undefined) delete environment.GITHUB_SNAPSHOT_DIR;
    else environment.GITHUB_SNAPSHOT_DIR = stage;
    return environment;
}

export function githubReadToken(directory = projectRoot, environment = process.env) {
    return readCredential("WEBPAGE_GITHUB_PROFILE_READONLY", directory, environment);
}
