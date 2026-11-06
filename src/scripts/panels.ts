import { animateElement, onPageLeave } from "./motion.ts";

const boundPanels = new WeakSet<HTMLDialogElement>();
const transitions = new WeakMap<HTMLDialogElement, AbortController>();
let delegated = false;
let returnFocus: HTMLElement | null = null;
const getPanels = () => [...document.querySelectorAll<HTMLDialogElement>("dialog[data-panel]")];

async function transitionPanel(panel: HTMLDialogElement, opening: boolean) {
    const previous = transitions.get(panel);
    const style = previous && panel.open ? getComputedStyle(panel) : null;
    const from = style ? { transform: style.transform, opacity: style.opacity } : null;
    previous?.abort();
    const controller = new AbortController();
    transitions.set(panel, controller);
    panel.dataset.panelMotion = opening ? "opening" : "closing";
    if (opening && !panel.open) panel.showModal();
    const collapsed = window.matchMedia("(max-width: 48rem)").matches
        ? { transform: "translate3d(0, 12px, 0) scale(.985)", opacity: 0 }
        : { transform: "translate3d(6px, -6px, 0) scale(.97)", opacity: 0 };
    const expanded = { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 };
    await animateElement(panel, [from ?? (opening ? collapsed : expanded), opening ? expanded : collapsed], {
        duration: opening ? 320 : 240, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both",
    }, controller.signal);
    if (controller.signal.aborted) return;
    transitions.delete(panel);
    if (!opening) panel.close();
    delete panel.dataset.panelMotion;
}

function openPanel(id: string) {
    const panels = getPanels();
    const panel = panels.find((candidate) => candidate.id === id);
    if (!panel || (panel.open && panel.dataset.panelMotion !== "closing")) return;
    if (!panels.some((candidate) => candidate.open)) returnFocus = document.activeElement as HTMLElement;
    for (const candidate of panels) if (candidate !== panel && candidate.open) {
        transitions.get(candidate)?.abort();
        candidate.close();
    }
    void transitionPanel(panel, true);
}

export function initializePanels() {
    document.querySelectorAll<HTMLElement>("[data-panel-open]").forEach((control) => { control.hidden = false; });
    for (const panel of getPanels()) {
        if (boundPanels.has(panel)) continue;
        boundPanels.add(panel);
        onPageLeave(() => { transitions.get(panel)?.abort(); returnFocus = null; });
        panel.addEventListener("close", () => {
            if (panel.open) return;
            transitions.get(panel)?.abort();
            transitions.delete(panel);
            delete panel.dataset.panelMotion;
            if (!getPanels().some((candidate) => candidate.open) && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        });
        panel.addEventListener("cancel", (event) => { event.preventDefault(); void transitionPanel(panel, false); });
        panel.addEventListener("wheel", (event) => {
            if (event.target === panel && !event.ctrlKey) event.preventDefault();
        }, { passive: false });
        panel.addEventListener("click", (event) => {
            if (event.target !== panel) return;
            const bounds = panel.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) void transitionPanel(panel, false);
        });
    }
    if (delegated) return;
    delegated = true;
    document.addEventListener("click", (event) => {
        const target = event.target as Element;
        const opener = target.closest<HTMLElement>("[data-panel-open]");
        if (opener) {
            event.preventDefault();
            openPanel(opener.dataset.panelOpen!);
        }
        const closer = target.closest("[data-panel-close]")?.closest("dialog");
        if (closer) void transitionPanel(closer, false);
    });
}
