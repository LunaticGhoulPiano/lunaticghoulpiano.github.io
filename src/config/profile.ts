import type { RouteKey } from "./routes";
import type { TranslationKey } from "../i18n/ui";

export const profileSections: Partial<Record<RouteKey, readonly TranslationKey[]>> = {
    profile: [
        "profile.about",
        "profile.focus",
        "cv.education",
        "route.studying",
        "route.interests",
    ],
    cv: [
        "cv.experience",
        "cv.education",
        "cv.projects",
        "cv.skills",
        "cv.awards",
        "cv.openSource",
    ],
    interests: ["route.interests"],
    studying: ["route.studying"],
    contact: ["contact.details", "contact.social"],
};
