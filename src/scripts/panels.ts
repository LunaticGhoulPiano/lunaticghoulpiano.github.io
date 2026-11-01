export function initializePanels() {
    const root = document.documentElement;
    if (root.dataset.panelsReady) return;
    root.dataset.panelsReady = "true";
    document.querySelectorAll<HTMLElement>("[data-panel-open]").forEach((control) => { control.hidden = false; });
    const panels = [...document.querySelectorAll<HTMLDialogElement>("dialog[data-panel]")];
    let returnFocus: HTMLElement | null = null;
    const openPanel = (id: string) => {
        const panel = panels.find((candidate) => candidate.id === id);
        if (! panel || panel.open) return;
        if (! panels.some((candidate) => candidate.open)) returnFocus = document.activeElement as HTMLElement;
        panels.filter((candidate) => candidate.open).forEach((candidate) => candidate.close());
        panel.showModal();
    };
    for (const panel of panels) {
        panel.addEventListener("close", () => {
            if (! panels.some((candidate) => candidate.open) && returnFocus?.isConnected) returnFocus.focus();
        });
        panel.addEventListener("click", (event) => {
            if (event.target !== panel) return;
            const bounds = panel.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) panel.close();
        });
    }
    document.addEventListener("click", (event) => {
        const target = event.target as Element;
        const opener = target.closest<HTMLElement>("[data-panel-open]");
        if (opener) {
            event.preventDefault();
            openPanel(opener.dataset.panelOpen!);
        }
        if (target.closest("[data-panel-close]")) target.closest("dialog")?.close();
    });
}
