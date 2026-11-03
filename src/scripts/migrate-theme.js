// Run before either theme controller. Docusaurus uses "theme", with no key for System.
(() => {
    try {
        const legacy = localStorage.getItem("site-theme");
        if (legacy === null) return;
        if (legacy === "system") localStorage.removeItem("theme");
        else if (legacy === "dark" || legacy === "light") localStorage.setItem("theme", legacy);
        localStorage.removeItem("site-theme");
    }
    catch { /* Storage may be unavailable. */ }
})();
