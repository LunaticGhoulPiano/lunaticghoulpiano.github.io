import React, { useEffect } from "react";
import NavbarLayout from "@theme-original/Navbar/Layout";
import { illuminateGlass } from "../../../../../../scripts/glass/lighting.js";

export default function Layout({ children, ...props }) {
    useEffect(() => illuminateGlass({
        surfaces: ".navbar, .navbar-sidebar, .dropdown__menu",
        controls: ".pagination-nav__link, .button, .theme-doc-toc-mobile > button",
        rules: ".navbar, .markdown hr, .table-of-contents",
    }), []);
    return <NavbarLayout {...props}>{children}</NavbarLayout>;
}
