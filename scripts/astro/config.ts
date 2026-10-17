import { defineConfig } from "astro/config";
import { site } from "../../src/config/site";
import { getRoutePath } from "../../src/routing";
import { localizedPath } from "../../src/config/locales";
import { projectPaths, temporaryRoot } from "../runtime.mjs";

export default defineConfig({
    site: site.url,
    output: "static",
    trailingSlash: "always",
    prerenderConflictBehavior: "error",
    integrations: [projectPaths],
    vite: {
        server: {
            watch: {
                ignored: [`${temporaryRoot.replaceAll("\\", "/")}/**`],
            },
        },
    },
    redirects: Object.fromEntries(
        site.locales.map((locale) => [localizedPath("", locale), getRoutePath("profile", locale)]),
    ),
    i18n: {
        locales: [...site.locales],
        defaultLocale: site.defaultLocale,
        routing: {
            prefixDefaultLocale: false,
        },
    },
});
