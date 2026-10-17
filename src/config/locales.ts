import { languageDefinitions } from "../i18n/registry.ts";

export const languages = Object.fromEntries(Object.entries(languageDefinitions).map(([locale, definition]) => {
    const { messages, ...metadata } = definition;
    return [locale, metadata];
})) as { [K in keyof typeof languageDefinitions]: Omit<(typeof languageDefinitions)[K], "messages"> };

export type Locale = keyof typeof languages;
export const defaultLocale = "en" satisfies Locale;
export const locales = Object.keys(languages) as Locale[];

export function localizedPath(path: string, locale: Locale): string {
    const prefix = locale === defaultLocale ? "" : `/${locale}`;
    const normalized = path.replace(/^\/+|\/+$/g, "");
    return normalized ? `${prefix}/${normalized}/` : `${prefix}/`;
}
