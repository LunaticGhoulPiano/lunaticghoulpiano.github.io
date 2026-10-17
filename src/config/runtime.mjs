import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Astro supplies its resolved root before bundling; direct Node scripts use this source location.
export const projectRoot = import.meta.env?.PROJECT_ROOT ?? fileURLToPath(new URL("../../", import.meta.url));
export const snapshotDirectory = resolve(projectRoot, "src/data/generated");
