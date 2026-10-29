import { readFileSync } from "node:fs";
import { site } from "../../config/site.ts";
import { languages, localizedPath } from "../../config/locales.ts";

const content = JSON.parse(readFileSync(new URL("./configs.json", import.meta.url), "utf8"));
const locale = process.env.DOCUSAURUS_CURRENT_LOCALE ?? site.defaultLocale;
const labels = {
    en: { docs: "Documentation", back: "All documentations" },
    "zh-tw": { docs: "文檔", back: "所有文檔" },
};

export default {
    title: "MyMusic5API",
    tagline: content.locales[locale].description,
    url: site.url,
    baseUrl: localizedPath(content.locales[locale].entry.path, locale),
    trailingSlash: true,
    onBrokenLinks: "throw",
    markdown: {
        hooks: { onBrokenMarkdownLinks: "throw" },
    },
    i18n: {
        defaultLocale: site.defaultLocale,
        locales: Object.keys(content.locales),
        localeConfigs: Object.fromEntries(Object.entries(content.locales).map(([key, value]) => [key, {
            label: languages[key].name,
            htmlLang: languages[key].htmlLang,
            baseUrl: localizedPath(value.entry.path, key),
        }])),
    },
    presets: [
        ["@docusaurus/preset-classic", {
            docs: {
                path: `./i18n/${locale}/docs`,
                routeBasePath: "/",
                sidebarPath: "./sidebars.js",
            },
            blog: false,
            pages: false,
            sitemap: false,
        }],
    ],
    themeConfig: {
        navbar: {
            title: "MyMusic5API",
            items: [
                { type: "docSidebar", sidebarId: "documentation", label: labels[locale].docs, position: "left" },
                { href: `${site.url}${localizedPath("documentations", locale)}`, label: labels[locale].back, position: "left" },
                { href: content.links[0].url, label: "GitHub", position: "right" },
                { type: "localeDropdown", position: "right" },
            ],
        },
        colorMode: {
            defaultMode: "light",
            respectPrefersColorScheme: true,
        },
    },
};
