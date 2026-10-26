import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { searchPolicy } from "../../src/config/search.ts";
import { searchText } from "../../src/utils/search_text.mjs";
import { isWithin, resolveItemFile } from "./loader.mjs";

/** @param {string} root @param {string} directory @param {string} entry */
export async function readSiteSearchText(root, directory, entry) {
    const site = await resolveItemFile(join(root, directory), entry, "directory");
    const texts = [];
    for (const path of (await readdir(site, { recursive: true })).filter((path) => path.endsWith(".html"))) {
        const file = await resolveItemFile(site, `./${path.replaceAll("\\", "/")}`);
        texts.push(searchText(await readFile(file, "utf8")));
    }
    return texts.join(" ");
}

/** @param {string} output */
export async function completeSearchIndex(output) {
    const path = join(output, searchPolicy.indexPath);
    const documents = JSON.parse(await readFile(path, "utf8"));
    for (const document of documents) {
        if (document.data.entryType !== "astro") continue;
        const file = join(output, document.data.href, "index.html");
        if (! isWithin(output, file)) throw new Error("Search page escapes the build directory.");
        document.data.body = searchText(await readFile(file, "utf8"));
    }
    await writeFile(path, JSON.stringify(documents));
}
