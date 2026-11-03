(() => {
    const root = document.documentElement;
    const configuration = JSON.parse(root.dataset.appearanceConfig || "{}");
    if (! configuration.defaults || ! configuration.options) return;
    const { defaults, options } = configuration;
    function readPreferences() {
        let saved;
        try { saved = JSON.parse(localStorage.getItem("site-appearance") || "{}"); }
        catch { /* Use defaults when storage is blocked or malformed. */ }
        return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
            options[key].includes(saved?.[key]) ? saved[key] : value,
        ]));
    }
    let preferences = readPreferences();
    const apply = () => {
        for (const [key, value] of Object.entries(preferences)) root.dataset[key] = value;
    };
    const save = () => {
        try { localStorage.setItem("site-appearance", JSON.stringify(preferences)); }
        catch { /* Keep this page's choices when storage is unavailable. */ }
    };
    apply();
    const boundControls = new WeakSet();
    const bindControls = () => {
        const controls = [...document.querySelectorAll("[data-appearance-setting]")];
        const sync = () => controls.forEach((control) => {
            const value = preferences[control.dataset.appearanceSetting];
            if (control.type === "radio") control.checked = control.value === value;
            else control.value = value;
        });
        for (const control of controls) {
            if (boundControls.has(control)) continue;
            boundControls.add(control);
            control.addEventListener("change", () => {
                const key = control.dataset.appearanceSetting;
                if (control.type === "radio" && ! control.checked) return;
                if (! options[key]?.includes(control.value)) return;
                preferences[key] = control.value;
                apply();
                save();
                sync();
            });
        }
        const reset = document.querySelector("[data-appearance-reset]");
        if (reset && !boundControls.has(reset)) {
            boundControls.add(reset);
            reset.addEventListener("click", () => {
                preferences = { ...defaults };
                apply();
                save();
                sync();
                document.dispatchEvent(new Event("site:reset"));
            });
        }
        sync();
    };
    document.addEventListener("DOMContentLoaded", bindControls, { once: true });
    document.addEventListener("astro:after-swap", apply);
    document.addEventListener("astro:page-load", bindControls);
    window.addEventListener("storage", (event) => {
        if (event.key !== "site-appearance" && event.key !== null) return;
        preferences = readPreferences();
        apply();
        bindControls();
    });
})();
