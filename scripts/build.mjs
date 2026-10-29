import { buildContents, buildOptions, runCommand } from "./content/build.mjs";
import { projectRoot } from "../src/config/runtime.mjs";
import { astroArguments } from "./astro/run.mjs";

try {
    const options = buildOptions();
    await buildContents(options);
    runCommand(["node", ...astroArguments("build", ...(options.force ? ["--force"] : []))], projectRoot);
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
