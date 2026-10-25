import { defineCollection } from "astro:content";
import { contentLoader } from "../scripts/content/loader.mjs";
import { contentSchema } from "./data/contents_schema";

export const collections = {
    items: defineCollection({
        loader: contentLoader(),
        schema: contentSchema,
    }),
};
