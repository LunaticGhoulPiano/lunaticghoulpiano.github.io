(() => {
    const preferences = ["system", "light", "dark"];
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    let preference = "system";
    let toggle = null;
    const boundToggles = new WeakSet();

    try {
        const saved = localStorage.getItem("theme");
        if (preferences.includes(saved)) preference = saved;
    }
    catch {
        // Keep the system preference when browser storage is unavailable.
    }

    function applyTheme() {
        const theme = preference === "system"
            ? (systemTheme.matches ? "dark" : "light")
            : preference;
        root.dataset.theme = theme;
        root.dataset.themePreference = preference;
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute("content", root.dataset[`${theme}Color`]);

        if (! toggle) return;
        const label = toggle.dataset[`${preference}Label`];
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
        const value = toggle.querySelector?.("[data-theme-value]");
        if (value) value.textContent = toggle.dataset[`${preference}Value`] || label;
    }

    function saveTheme() {
        try {
            if (preference === "system") localStorage.removeItem("theme");
            else localStorage.setItem("theme", preference);
        }
        catch { /* Keep the selected theme active for this page. */ }
    }

    function bindToggle() {
        toggle = document.querySelector("[data-theme-toggle]");
        if (! toggle) return;
        toggle.hidden = false;
        applyTheme();
        if (boundToggles.has(toggle)) return;
        boundToggles.add(toggle);
        toggle.addEventListener("click", () => {
            preference = preferences[(preferences.indexOf(preference) + 1) % preferences.length];
            applyTheme();
            saveTheme();
        });
    }

    applyTheme();
    window.addEventListener("storage", (event) => {
        if (event.key !== "theme" && event.key !== null) return;
        preference = preferences.includes(event.newValue) ? event.newValue : "system";
        applyTheme();
    });
    systemTheme.addEventListener("change", () => {
        if (preference === "system") applyTheme();
    });
    document.addEventListener("DOMContentLoaded", bindToggle, {
        once: true,
    });
    document.addEventListener("astro:after-swap", applyTheme);
    document.addEventListener("astro:page-load", bindToggle);
    document.addEventListener("site:reset", () => {
        preference = "system";
        applyTheme();
        saveTheme();
    });
})();
