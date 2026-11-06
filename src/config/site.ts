import { defaultLocale, locales } from "./locales.ts";

export { languages, type Locale } from "./locales.ts";

export const site = {
    name: "Emile Su",
    copyright: "Copyright © 2026 Emile Su",
    brand: "Emile Su's Playground",
    secondaryName: "安久琲奈 / LunaticGhoulPiano",
    handle: "LunaticGhoulPiano",
    github: "https://github.com/LunaticGhoulPiano",
    url: "https://lunaticghoulpiano.github.io",
    defaultLocale,
    locales,
} as const;
