export const themes = {
    light: {
        background: "#f6f5f0",
        text: "#292c28",
        muted: "#6e7068",
        accent: "#9b3c30",
        line: "#dcded5",
        subtle: "#eeeee7",
        field: "#fcfcf8",
        "highlight-background": "#174b8a",
        "highlight-text": "#ffffff",
    },
    dark: {
        background: "#1d1e1b",
        text: "#e6e7de",
        muted: "#aaaea1",
        accent: "#e69d88",
        line: "#3b3e35",
        subtle: "#272a23",
        field: "#22251f",
        "highlight-background": "#ffe066",
        "highlight-text": "#171b20",
    },
} as const;

const printTheme = {
    background: "#fff",
    text: "#111",
    muted: "#444",
    accent: "#222",
    line: "#ccc",
    "highlight-background": "#fff",
    "highlight-text": "#111",
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
        :root, :root[data-theme] { color-scheme: light; ${variables(printTheme)} }
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
