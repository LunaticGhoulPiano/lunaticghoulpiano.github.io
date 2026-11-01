import { profileNavigation, profileSections } from "../../config/profile.ts";
import type { RouteKey } from "../../config/routes.ts";

export function getProfilePage(route: RouteKey) {
    return {
        section: "profile" as const,
        navigation: profileNavigation,
        fields: profileSections[route] ?? [],
    };
}
