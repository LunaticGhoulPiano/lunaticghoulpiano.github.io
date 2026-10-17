import { site } from "../config/site";
import { getPageEntries } from "../routing";
import { getPublicPosts } from "../services/blog/index";

export async function GET() {
    const posts = await getPublicPosts();
    const paths = getPageEntries(posts).map((entry) => `/${entry.params.path}/`);
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
