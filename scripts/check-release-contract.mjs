import { readFileSync } from "node:fs";

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Release contract missing ${label}`);
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
if (vercelConfig.git?.deploymentEnabled !== false) throw new Error("Vercel Git auto-deploy must remain disabled");

const workflow = readFileSync(".github/workflows/vercel-production.yml", "utf8");
requireText(workflow, '[[ "$GITHUB_REF" == "refs/heads/main" ]]', "main-ref rejection gate");
requireText(workflow, '[[ "$GITHUB_SHA" == "$main_sha" ]]', "exact current-main SHA gate");
requireText(workflow, "Recognize already-verified production", "artifact-expiry idempotence check");
requireText(workflow, "sourcePipeline=github-actions-prebuilt-v1", "verified prebuilt deployment metadata");
requireText(workflow, "Current main is not already verified in production and its CI artifact is unavailable", "fail-closed artifact fallback");
requireText(workflow, "bash scripts/smoke-vercel-live.sh "$PRODUCTION_URL"", "artifact-free production smoke");
requireText(workflow, 'artifact_digest" != "${EXPECTED_ARTIFACT_DIGEST#sha256:}', "available-artifact digest comparison");
requireText(workflow, "for required_job in $REQUIRED_CI_JOBS; do", "shared required-job contract");
const gatedSteps = [
  "Download and verify exact artifact archive", "Install pinned release tooling", "Create Build Output API v3 package",
  "Stage exact production deployment", "Smoke-check staged deployment", "Determine whether promotion is needed",
];
for (const name of gatedSteps) {
  requireText(workflow, `- name: ${name}\n        if: steps.current_release.outputs.already_released != 'true'`, `no-op gate for ${name}`);
}
console.log("Release contract checks passed");
