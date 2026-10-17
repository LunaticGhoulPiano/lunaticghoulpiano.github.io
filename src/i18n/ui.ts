import type { Locale } from "../config/locales.ts";
import en from "./messages/en.ts";
import { languageDefinitions } from "./registry.ts";
import type { PluralMessage } from "./format.ts";

type Messages = {
    [Group in keyof typeof en]: {
        [Key in keyof (typeof en)[Group]]: (typeof en)[Group][Key] extends string ? string : PluralMessage;
    };
};

const definitions: Record<Locale, {
    messages: Messages;
}> = languageDefinitions;
export const messages = Object.fromEntries(Object.entries(definitions).map(([locale, definition]) => [locale, definition.messages])) as Record<Locale, Messages>;

export type TranslationKey = keyof Messages["ui"];

export function useMessages(locale: Locale): Messages {
    return messages[locale];
}

export function useTranslations(locale: Locale) {
    return (key: TranslationKey): string => messages[locale].ui[key];
}
