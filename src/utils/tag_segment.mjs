import { createHash } from "node:crypto";
import { contentRules } from "../config/content.ts";

/** @param {string} value */
export function tagSegment(value) {
    if (contentRules.slugPattern.test(value) && ! /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(value)) return value;
    // Stable ASCII paths avoid filesystem limits, case collisions and URL delimiters without changing labels.
    return `~${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
