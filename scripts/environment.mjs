import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { projectRoot } from "../src/config/runtime.mjs";

export function readCredential(name, directory = projectRoot, environment = process.env) {
    if (environment[name]) return environment[name];
    for (const filename of [".env.local", ".env"]) {
        try {
            const values = parseEnv(readFileSync(resolve(directory, filename), "utf8"));
            if (values[name]) return values[name];
        }
        catch (error) {
            if (error.code !== "ENOENT") throw new Error(`Cannot read credential from ${filename}.`);
        }
    }
    return undefined;
}
