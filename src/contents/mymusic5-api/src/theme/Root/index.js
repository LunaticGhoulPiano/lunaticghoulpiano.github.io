import React, { useEffect } from "react";
import { useHistory } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { illuminateGlass } from "../../../../../scripts/glass/lighting.js";
import { fadeContent } from "../../../../../scripts/motion.ts";

export default function Root({ children }) {
    const history = useHistory();
    const { siteConfig } = useDocusaurusContext();
    useEffect(() => {
        const cleanup = illuminateGlass({
            surfaces: ".navbar, .navbar-sidebar, .dropdown__menu",
            controls: ".pagination-nav__link, .button, .theme-doc-toc-mobile > button",
            rules: ".table-of-contents",
        });
        let leaving;
        const click = async (event) => {
            const link = event.target.closest?.("a[href]");
            if (!link || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
                || link.hasAttribute("download") || (link.target && link.target !== "_self") || link.closest('[data-motion="off"]')) return;
            const url = new URL(link.href);
            if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
            const main = document.querySelector("main");
            if (!main) return;
            event.preventDefault();
            // Keep React's onClick callbacks (including closing the mobile menu).
            // preventDefault already stops React Router's immediate navigation.
            leaving?.abort();
            const controller = new AbortController();
            leaving = controller;
            const internal = url.pathname.startsWith(siteConfig.baseUrl);
            await fadeContent(main, controller.signal, !internal);
            if (controller.signal.aborted) return;
            if (internal) history.push(url.pathname + url.search + url.hash);
            else location.assign(url.href);
        };
        document.addEventListener("click", click, true);
        return () => { leaving?.abort(); cleanup(); document.removeEventListener("click", click, true); };
    }, [history, siteConfig.baseUrl]);
    return <><div className="desktop-background" aria-hidden="true" />{children}</>;
}
