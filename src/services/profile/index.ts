import { profileSections } from "../../config/profile.ts";
import type { RouteKey } from "../../config/routes.ts";
import { getSectionRoutes } from "../../routing.ts";

export function getProfilePage(route: RouteKey) {
    return {
        section: "profile" as const,
        navigation: getSectionRoutes("profile"),
        fields: profileSections[route] ?? [],
    };
}
