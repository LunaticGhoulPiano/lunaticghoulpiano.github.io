import { z } from "astro/zod";
import { languages, type Locale } from "../config/locales.ts";
import { dayMilliseconds, snapshotDateOptions } from "../config/time.ts";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD calendar date.");

function utcDate(value: string) {
    return new Date(value).toISOString().slice(0, 10);
}

export function utcDayWindows(period: {
    from: string;
    to: string;
}) {
    const from = Date.parse(period.from);
    const to = Date.parse(period.to);
    const days: {
        date: string;
        from: string;
        to: string;
    }[] = [];
    for (let day = Date.parse(`${utcDate(period.from)}T00:00:00Z`); day <= to; day += dayMilliseconds) {
        days.push({
            date: utcDate(new Date(day).toISOString()),
            from: new Date(Math.max(day, from)).toISOString(),
            to: new Date(Math.min(day + dayMilliseconds - 1, to)).toISOString(),
        });
    }
    return days;
}

export function isWithinAge(timestamp: string, now: number, maxAge: number) {
    const age = now - Date.parse(timestamp);
    return age >= 0 && age < maxAge;
}

export function displayDate(value: string) {
    return utcDate(value).replaceAll("-", " / ");
}

export function displayTimestamp(value: string, locale: Locale) {
    return new Intl.DateTimeFormat(languages[locale].formatLocale, snapshotDateOptions).format(new Date(value));
}
