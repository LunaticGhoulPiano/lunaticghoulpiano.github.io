import { snapshotToolPolicy } from "./config.ts";
import { snapshotDirectory } from "../../src/config/runtime.mjs";
import { temporaryRoot } from "../runtime.mjs";
import { join } from "node:path";
import { findWorkflowArtifact } from "../artifacts.mjs";

export const restoredSnapshotDirectory = join(temporaryRoot, "snapshots");

export async function selectSnapshots({ github, context, core }) {
    core.setOutput("artifact_name", snapshotToolPolicy.artifactName);
    core.setOutput("snapshot_files", snapshotToolPolicy.filenames.map((filename) => join(snapshotDirectory, filename)).join("\n"));
    core.setOutput("restore_directory", restoredSnapshotDirectory);
    for (const name of [snapshotToolPolicy.artifactName, snapshotToolPolicy.legacyArtifactName]) {
        const artifact = await findWorkflowArtifact({ github, context, name });
        if (artifact) {
            core.setOutput("artifact_id", String(artifact.id));
            core.setOutput("run_id", String(artifact.workflow_run.id));
            core.info(`Restoring validated snapshots from workflow run ${artifact.workflow_run.id}.`);
            return;
        }
    }

    core.info("No retained snapshot artifact found; fresh API data is required.");
}
