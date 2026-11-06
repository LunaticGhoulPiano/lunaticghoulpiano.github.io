import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot, snapshotDirectory } from "../src/config/runtime.mjs";
import { temporaryRoot } from "./runtime.mjs";
import { snapshotToolPolicy } from "./snapshots/config.ts";
import { artifactPolicy, findWorkflowArtifact } from "./artifacts.mjs";

const artifactName = "site_deployment";
const restoreDirectory = join(temporaryRoot, "deployment");
const manifestFile = join(temporaryRoot, "deployment-current", "deployment.json");
const rootInputs = new Set([
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
    ".node-version", ".gitmodules", ".gitignore", artifactPolicy.workflow,
]);

export async function selectDeployment({ github, context, core }) {
    core.setOutput("artifact_name", artifactName);
    core.setOutput("restore_directory", restoreDirectory);
    core.setOutput("manifest_file", manifestFile);
    const artifact = await findWorkflowArtifact({ github, context, name: artifactName, requireSuccess: true });
    if (artifact) {
        core.setOutput("artifact_id", String(artifact.id));
        core.setOutput("run_id", String(artifact.workflow_run.id));
        core.info(`Comparing with successful deployment from workflow run ${artifact.workflow_run.id}.`);
    } else core.info("No retained successful deployment baseline; a deployment is required.");
}

function canonicalSnapshot(value) {
    if (Array.isArray(value)) return value.map(canonicalSnapshot);
    if (!value || typeof value !== "object") return value;
    const envelope = typeof value.source === "string" && "lastSuccessfulFetchAt" in value;
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
        if (envelope && key === "lastSuccessfulFetchAt") return [];
        // The header displays calendar dates, not the polling time within each day.
        if (envelope && key === "period") return [[key, {
            from: value.period.from.slice(0, 10), to: value.period.to.slice(0, 10),
        }]];
        return [[key, canonicalSnapshot(value[key])]];
    }));
}

export function deploymentFingerprint(tree, snapshots) {
    // Git's tree records include file contents, paths, modes and submodule SHAs.
    // A new commit containing only developer notes does not change the website.
    const sources = tree.split("\0").filter((entry) => {
        const path = entry.slice(entry.indexOf("\t") + 1);
        return /^(src|public|scripts|vendor)\//.test(path) || rootInputs.has(path);
    }).sort();
    return createHash("sha256").update(JSON.stringify({
        version: 1, sources, snapshots: canonicalSnapshot(snapshots),
    })).digest("hex");
}

export async function compareDeployment({
    tree = execFileSync("git", ["ls-tree", "-rz", "--full-tree", "HEAD"], { cwd: projectRoot, encoding: "utf8" }),
    directory = snapshotDirectory,
    previousFile = join(restoreDirectory, "deployment.json"),
    outputFile = manifestFile,
    actionsOutput = process.env.GITHUB_OUTPUT,
} = {}) {
    const snapshots = Object.fromEntries(await Promise.all(snapshotToolPolicy.filenames.map(async (name) =>
        [name, JSON.parse(await readFile(join(directory, name), "utf8"))],
    )));
    const fingerprint = deploymentFingerprint(tree, snapshots);
    let previous;
    try { previous = JSON.parse(await readFile(previousFile, "utf8")); }
    catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    const changed = previous?.fingerprint !== fingerprint;
    await mkdir(resolve(outputFile, ".."), { recursive: true });
    await writeFile(outputFile, JSON.stringify({ fingerprint }) + "\n");
    if (actionsOutput) await appendFile(actionsOutput, `changed=${changed}\n`);
    console.info(changed
        ? "[Deployment] Website inputs changed or no baseline exists; build and deploy required."
        : "[Deployment] Website inputs unchanged; skipping build and deployment.");
    return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await compareDeployment();
}
