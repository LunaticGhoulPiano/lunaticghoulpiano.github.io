import { compareMymusic5Sheets, mymusic5Difficulties, mymusic5DifficultyLabels } from "../../config/mymusic5.ts";
import { locales, type Locale } from "../../config/locales.ts";
import { useMessages } from "../../i18n/ui.ts";
import { getMymusic5Data } from "./store.mjs";
import type { Mymusic5Snapshot } from "./schema.ts";

type Sheet = Mymusic5Snapshot["sheets"][number];

export function mymusic5SheetAttributes(sheet: Sheet, locale: Locale): string[] {
    const copy = useMessages(locale).mymusic5;
    const levels = mymusic5DifficultyLabels(copy);
    const instruments: Record<string, string> = { "piano-88keys": copy.piano, kalimba: copy.kalimba, "bass-guitar": copy.bass, drum: copy.drums };
    const sheetTypes: Record<string, string> = { "1staff": copy.oneStaff, "2staves": copy.twoStaves, tab: copy.tablature };
    return [
        ...sheet.instruments.map((instrument) => instruments[instrument] ?? instrument),
        sheet.level === null ? null : levels[sheet.level] ?? String(sheet.level),
        sheet.instrumentation === "solo" ? copy.solo : sheet.instrumentation === "unspecified" ? null : sheet.instrumentation,
        sheet.sheetType && (sheetTypes[sheet.sheetType] ?? sheet.sheetType),
        sheet.includeChord ? copy.chords : null,
        sheet.includeLyrics ? copy.lyrics : null,
    ].filter((value): value is string => Boolean(value));
}

export function mymusic5SearchText(sheet: Sheet): string {
    const difficultyKeys: Record<number, string> = mymusic5Difficulties;
    return [...new Set([
        sheet.title, sheet.metaSong, sheet.metaMusician, sheet.metaMaker, sheet.description,
        ...sheet.instruments,
        sheet.level === null ? null : difficultyKeys[sheet.level],
        ...locales.flatMap((locale) => mymusic5SheetAttributes(sheet, locale)),
    ].filter(Boolean))].join(" ");
}

export function getMymusic5Content(snapshot: Mymusic5Snapshot | null = getMymusic5Data()) {
    return {
        period: null,
        notice: snapshot && { lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt },
        author: snapshot?.author ?? null,
        sheets: (snapshot?.sheets ?? []).toSorted(compareMymusic5Sheets),
    };
}
