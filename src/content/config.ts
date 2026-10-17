import { defineCollection } from "astro:content";
import { markdownLoader } from "./loader.mjs";
import { blogSchema, projectSchema, studyingSchema } from "./schema";

export const collections = {
    blog: defineCollection({
        loader: markdownLoader("./src/content/blog"),
        schema: blogSchema,
    }),
    projects: defineCollection({
        loader: markdownLoader("./src/content/projects"),
        schema: projectSchema,
    }),
    studying: defineCollection({
        loader: markdownLoader("./src/content/studying"),
        schema: studyingSchema,
    }),
};
