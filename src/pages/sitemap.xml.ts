import { site } from "../config/site";
import { getPageEntries, getRoutePath } from "../routing";
import { getContent } from "../data/contents";

export async function GET() {
    const posts = await getContent();
    const paths = new Set(getPageEntries(posts).map(({ params, props }) =>
        props.kind === "page" ? getRoutePath(props.route, props.locale) : `/${params.path}/`));
    for (const item of posts) {
        if (item.data.entry.type === "site" || item.data.entry.type === "astro") paths.add(item.data.href);
    }
    const escape = (value: string) =>
        value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
            ...paths,
        ]
            .sort()
            .map((path) => `<url><loc>${escape(new URL(path, site.url).href)}</loc></url>`)
            .join("")}</urlset>`,
        {
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
            },
        },
    );
}
