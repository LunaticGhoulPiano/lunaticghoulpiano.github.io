import { githubPolicy } from "../../src/config/github.ts";
import { youtubePolicy } from "../../src/config/youtube.ts";
import { mymusic5Policy } from "../../src/config/mymusic5.ts";

export const snapshotToolPolicy = {
    artifactName: "site_snapshots",
    legacyArtifactName: "github_profile_snapshots",
    artifactCandidates: 10,
    pageSize: 100,
    workflow: ".github/workflows/deploy.yml",
    workflowEvents: ["push", "schedule", "workflow_dispatch"],
    filenames: [
        githubPolicy.snapshotFilename,
        youtubePolicy.snapshotFilename,
        mymusic5Policy.snapshotFilename,
    ],
} as const;
