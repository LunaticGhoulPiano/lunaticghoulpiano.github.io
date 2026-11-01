import { themePresets, defaultThemePreset, type ThemePreset } from "./theme.ts";

export const appearanceOptions = {
    preset: Object.keys(themePresets) as ThemePreset[],
} as const;

export const appearanceDefaults = {
    preset: defaultThemePreset,
} as const;

export const appearanceConfiguration = {
    options: appearanceOptions,
    defaults: appearanceDefaults,
    colors: Object.fromEntries(Object.entries(themePresets).map(([preset, modes]) => [preset, {
        light: modes.light.background, dark: modes.dark.background,
    }])),
};
