export const hourMilliseconds = 60 * 60 * 1000;
export const dayMilliseconds = 24 * hourMilliseconds;
const displayTimeZone = "Asia/Taipei";

export const snapshotDateOptions = {
    timeZone: displayTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
} as const;
