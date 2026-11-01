const lightHighlight = { "highlight-background": "#174b8a", "highlight-text": "#ffffff" };
const darkHighlight = { "highlight-background": "#ffe066", "highlight-text": "#171b20" };

export const themePresets = {
    piano: {
        light: { background: "#f2f0eb", text: "#292723", muted: "#656058", accent: "#785333", line: "#d5d0c7", subtle: "#e9e5dd", field: "#faf9f6", surface: "#faf9f6", ...lightHighlight },
        dark: { background: "#161615", text: "#ece9e1", muted: "#b7b1a6", accent: "#dfc59b", line: "#3b3a36", subtle: "#2b2a26", field: "#20201e", surface: "#1c1c1a", ...darkHighlight },
    },
    aviation: {
        light: { background: "#edf2f5", text: "#21313d", muted: "#526574", accent: "#245e7e", line: "#cbd6de", subtle: "#e0e9ee", field: "#f7fafc", surface: "#f7fafc", ...lightHighlight },
        dark: { background: "#121a20", text: "#e5edf2", muted: "#a9bac7", accent: "#e3bf7e", line: "#33434e", subtle: "#22313b", field: "#1a252d", surface: "#18232b", ...darkHighlight },
    },
} as const;

export type ThemePreset = keyof typeof themePresets;
export const defaultThemePreset = "piano" satisfies ThemePreset;
export const themes = themePresets[defaultThemePreset];

const printTheme = {
    background: "#fff",
    text: "#111",
    muted: "#444",
    accent: "#222",
    line: "#ccc",
    surface: "#fff",
    field: "#fff",
    subtle: "#fff",
    "highlight-background": "#fff",
    "highlight-text": "#111",
};

function variables(colors: Record<string, string>) {
    return Object.entries(colors).map(([name, value]) => `--${name}:${value};`).join("");
}

export const themeStyles = `
    :root { color-scheme: light; ${variables(themes.light)} }
    :root[data-theme="dark"] { color-scheme: dark; ${variables(themes.dark)} }
    ${Object.entries(themePresets).map(([name, palette]) => `
        :root[data-preset="${name}"] { color-scheme: light; ${variables(palette.light)} }
        :root[data-preset="${name}"][data-theme="dark"] { color-scheme: dark; ${variables(palette.dark)} }
    `).join("")}
    @media screen and (prefers-color-scheme: dark) {
        :root:not([data-theme]) { color-scheme: dark; ${variables(themes.dark)} }
        ${Object.entries(themePresets).map(([name, palette]) => `:root[data-preset="${name}"]:not([data-theme]) { color-scheme: dark; ${variables(palette.dark)} }`).join("")}
    }
    @media print {
        :root, :root[data-theme], :root[data-preset], :root[data-preset][data-theme] { color-scheme: light; ${variables(printTheme)} }
    }
`;

const languageColors: Record<string, string> = {
    Rust: "#b65e40",
    Astro: "#ae487a",
    TypeScript: "#467eaa",
    Python: "#8b792c",
    "Jupyter Notebook": "#b87232",
    "C++": "#9b587c",
    Verilog: "#648348",
    Assembly: "#76834b",
    HTML: "#b76545",
    JavaScript: "#a78b29",
};

export function repositoryColor(language: string) {
    return languageColors[language] ?? "#888888";
}
