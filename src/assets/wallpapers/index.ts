import type { ImageMetadata } from "astro";
import type { ThemePreset } from "../../config/theme";
import piano from "./piano.webp";
import aviation from "./aviation.webp";
import credits from "./credits.json";

// Render-only assets stay separate from the configuration also used by Node and Docusaurus.
export const wallpapers = {
    piano: { image: piano, position: "center 62%", credit: credits["piano.webp"] },
    aviation: { image: aviation, position: "center 52%", credit: credits["aviation.webp"] },
} satisfies Record<ThemePreset, {
    image: ImageMetadata;
    position: string;
    credit: { photographer: string; source: string };
}>;
