import { existsSync } from "node:fs";
import { glob } from "astro/loaders";
import { contentIdSchema } from "./schema.ts";

export function markdownLoader(base) {
    return {
        name: "markdown-loader",
        async load(context) {
            const filesById = new Map();
            const source = glob({
                base,
                pattern: "**/*.md",
                generateId({ data, entry, base: directory }) {
                    const id = contentIdSchema.parse(data.slug);
                    const previous = filesById.get(id);
                    if (previous
                        && previous !== entry
                        && existsSync(new URL(`./${encodeURI(previous)}`, directory))) throw new Error(`Duplicate content ID ${id}: ${previous} and ${entry}`);
                    filesById.set(id, entry);
                    return id;
                },
            });
            await source.load(context);
        },
    };
}
