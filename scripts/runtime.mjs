import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { projectRoot } from "../src/config/runtime.mjs";

export const temporaryRoot = resolve(projectRoot, "temp");
export const astroExecutable = resolve(projectRoot, "node_modules/astro/bin/astro.mjs");

/** @type {import("astro").AstroIntegration} */
export const projectPaths = {
    name: "project_paths",
    hooks: {
        "astro:config:setup": ({ config, updateConfig }) => {
            updateConfig({
                vite: {
                    define: {
                        "import.meta.env.PROJECT_ROOT": JSON.stringify(fileURLToPath(config.root)),
                    },
                },
            });
        },
    },
};
