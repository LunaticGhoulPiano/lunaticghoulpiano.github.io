import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

export default function NavbarLogo() {
    const { siteConfig: { customFields, themeConfig } } = useDocusaurusContext();
    return <a className="navbar__brand" href={customFields.homePath}>
        <b className="navbar__title text--truncate">{themeConfig.navbar.title}</b>
    </a>;
}
