export const themes = {
    light: {
        background: "#f4f3ef", text: "#232729", muted: "#434c50", accent: "#624523", line: "#c6cbca",
        subtle: "#e2e7e6", field: "#f0f3f1", surface: "#fafbf8",
        "code-bg": "#e8edec", "syntax-comment": "#4c5c60", "syntax-keyword": "#583d68",
        "syntax-string": "#245744", "syntax-name": "#27506b", "syntax-value": "#70432b",
        "highlight-background": "#174b8a", "highlight-text": "#ffffff", "focus-glow": "rgb(77 67 55 / .25)",
    },
    dark: {
        background: "#171a1b", text: "#f1f1eb", muted: "#c2c8c7", accent: "#e6ca9e", line: "#475052",
        subtle: "#30383a", field: "#262d2e", surface: "#202627",
        "code-bg": "#252d30", "syntax-comment": "#adb9b9", "syntax-keyword": "#dcc3e5",
        "syntax-string": "#a9d5ba", "syntax-name": "#accfe2", "syntax-value": "#e8c1a5",
        "highlight-background": "#ffe066", "highlight-text": "#171b20", "focus-glow": "rgb(255 255 255 / .32)",
    },
} as const;

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
    "focus-glow": "transparent",
};

function variables(colors: Record<string, string>) {
    return Object.entries(colors).map(([name, value]) => `--${name}:${value};`).join("");
}

export const themeStyles = `
    :root { color-scheme: light; ${variables(themes.light)} }
    :root[data-theme="dark"] { color-scheme: dark; ${variables(themes.dark)} }
    @media screen and (prefers-color-scheme: dark) {
        :root:not([data-theme]) { color-scheme: dark; ${variables(themes.dark)} }
    }
    @media print {
        :root, :root[data-theme] { color-scheme: light; ${variables(themes.light)} ${variables(printTheme)} }
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
