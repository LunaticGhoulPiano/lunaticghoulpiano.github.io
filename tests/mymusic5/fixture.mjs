import { mymusic5Artist } from "../../src/config/mymusic5.ts";

export const fixtureNow = new Date("2026-10-20T04:00:00Z");

export function fixtureFetch({
    count = 23,
    calls = [],
    transform = (_page, data) => data,
    transformSheet = (sheet) => sheet,
} = {}) {
    const catalog = Array.from({ length: count }, (_, index) => ({
        sheetId: index + 1,
        title: "Song &amp; Artist",
        description: "<p>Notes &amp; chords</p>",
        metaSong: "Song &#x27;One&#39;",
        metaMusician: "Composer",
        metaMaker: "Arranger",
        thumbnailUrl: "https://img.musicfive.com/score.webp",
        youtubeId: "5CinWpLxyAY",
        instruments: ["piano-88keys"],
        level: 2,
        instrumentation: "solo",
        sheetType: "2staves",
        includeChord: false,
        includeLyrics: false,
        price: index === 0 ? 0 : 3,
        currency: "USD",
        isFree: index === 0,
        status: "ON_SALE",
        createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString().replace(/Z$/, ""),
        updatedAt: fixtureNow.toISOString().replace(/Z$/, ""),
        likes: 0,
        author: {
            artistUrl: mymusic5Artist.artistUrl,
            name: "Artist &amp; Arranger",
            profileUrl: "https://cdn.mymusic5.com/avatar.webp",
            userId: 42,
        },
        files: [{ pages: 3, previews: ["https://img.musicfive.com/page.webp"] }],
        futureField: { nested: [null, "unchanged"] },
    }));
    return async (url, options) => {
        const path = new URL(url).pathname;
        if (options.method === "GET") {
            const id = Number(path.split("/").at(-1));
            calls.push({ url, options });
            const sheet = catalog.find((entry) => entry.sheetId === id);
            return new Response(JSON.stringify(transformSheet(structuredClone(sheet))), { status: 200 });
        }
        const body = JSON.parse(options.body);
        const { page, listNum } = body.variables.data;
        calls.push({ url, options, body });
        const list = catalog.slice((page - 1) * listNum, page * listNum)
            .map(({ sheetId, author }) => ({ sheetId, author: { artistUrl: author.artistUrl } }));
        return new Response(JSON.stringify(transform(page, {
            data: { sheetSearch: { list, current: page, total: count, listNum } },
        })), { status: 200 });
    };
}
