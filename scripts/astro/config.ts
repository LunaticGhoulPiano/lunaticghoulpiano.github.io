import { defineConfig } from "astro/config";
import { site } from "../../src/config/site";
import { projectPaths, temporaryRoot } from "../runtime.mjs";
import { itemContent } from "../content/integration.mjs";

export default defineConfig({
    site: site.url,
    output: "static",
    trailingSlash: "always",
    prerenderConflictBehavior: "error",
    integrations: [projectPaths, itemContent()],
    vite: {
        server: {
            watch: {
                ignored: [`${temporaryRoot.replaceAll("\\", "/")}/**`],
            },
        },
    },
    i18n: {
        locales: [...site.locales],
        defaultLocale: site.defaultLocale,
        routing: {
            prefixDefaultLocale: false,
        },
    },
});
