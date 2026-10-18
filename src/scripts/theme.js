(() => {
    const preferences = ["system", "light", "dark"];
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    let preference = "system";
    let toggle = null;

    try {
        const saved = localStorage.getItem("site-theme");
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
    }

    function bindToggle() {
        toggle = document.querySelector("[data-theme-toggle]");
        if (! toggle) return;
        toggle.hidden = false;
        applyTheme();
        toggle.addEventListener("click", () => {
            preference = preferences[(preferences.indexOf(preference) + 1) % preferences.length];
            applyTheme();
            try {
                localStorage.setItem("site-theme", preference);
            }
            catch {
                // Keep the selected theme active for this page.
            }
        });
    }

    applyTheme();
    systemTheme.addEventListener("change", () => {
        if (preference === "system") applyTheme();
    });
    document.addEventListener("DOMContentLoaded", bindToggle, {
        once: true,
    });
})();
