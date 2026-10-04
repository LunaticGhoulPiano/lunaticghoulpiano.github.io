import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://lunaticghoulpiano.github.io",
  output: "static",
  trailingSlash: "always",
  i18n: {
    locales: ["en", "zh-tw"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
