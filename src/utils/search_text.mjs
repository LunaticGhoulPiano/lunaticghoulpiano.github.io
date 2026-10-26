/** @param {string} html */
export function searchText(html) {
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
    const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return main.replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|head|nav|aside|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
            if (! entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
            const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
            return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
        }).replace(/\s+/gu, " ").trim();
}
