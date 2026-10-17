import en from "./messages/en.ts";
import zhTw from "./messages/zh_tw.ts";

export const languageDefinitions = {
    en: {
        name: "English",
        shortName: "EN",
        htmlLang: "en",
        formatLocale: "en-GB",
        messages: en,
    },
    "zh-tw": {
        name: "繁體中文",
        shortName: "繁中",
        htmlLang: "zh-TW",
        formatLocale: "zh-TW",
        messages: zhTw,
    },
} as const;
