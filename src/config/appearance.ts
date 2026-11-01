import { themePresets, defaultThemePreset, type ThemePreset } from "./theme.ts";

export const appearanceOptions = {
    preset: Object.keys(themePresets) as ThemePreset[],
    wallpaper: ["scene", "plain"],
    shade: ["soft", "deep"],
    motion: ["subtle", "off"],
    dock: ["icons", "labels"],
    density: ["comfortable", "compact"],
} as const;

export const appearanceDefaults = {
    preset: defaultThemePreset,
    wallpaper: "scene",
    shade: "soft",
    motion: "subtle",
    dock: "icons",
    density: "comfortable",
} as const;

export const appearanceConfiguration = {
    options: appearanceOptions,
    defaults: appearanceDefaults,
    colors: Object.fromEntries(Object.entries(themePresets).map(([preset, modes]) => [preset, {
        light: modes.light.background, dark: modes.dark.background,
    }])),
};
