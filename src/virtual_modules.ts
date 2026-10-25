declare module "virtual:content-components" {
    import type { AstroComponentFactory } from "astro/runtime/server/index.js";
    const components: Record<string, () => Promise<{ default: AstroComponentFactory }>>;
    export default components;
}

declare module "virtual:content-status" {
    const hasPublishedContent: boolean;
    export default hasPublishedContent;
}
