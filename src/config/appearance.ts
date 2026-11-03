export const appearanceOptions = {
    preset: ["piano", "aviation"],
} as const;

export const appearanceDefaults = {
    preset: "piano",
} as const;

export const appearanceConfiguration = {
    options: appearanceOptions,
    defaults: appearanceDefaults,
};
