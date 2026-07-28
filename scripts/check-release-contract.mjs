import { readFileSync } from "node:fs";

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Release contract missing ${label}`);
}
function requireCount(text, fragment, expected, label) {
  const actual = text.split(fragment).length - 1;
  if (actual !== expected) throw new Error(`Release contract expected ${expected} ${label}, found ${actual}`);
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
if (vercelConfig.git?.deploymentEnabled !== false) throw new Error("Vercel Git auto-deploy must remain disabled");

const liveSmoke = readFileSync("scripts/smoke-vercel-live.sh", "utf8");
const outputSmoke = readFileSync("scripts/smoke-vercel-output.sh", "utf8");
const liveSmokeTest = readFileSync("scripts/test-smoke-vercel-live.sh", "utf8");
const rootHeaders = vercelConfig.headers?.find((entry) => entry.source === "/(.*)")?.headers;
if (!Array.isArray(rootHeaders) || rootHeaders.length === 0) throw new Error("Vercel root security headers are missing");
for (const { key, value } of rootHeaders) {
  const header = `${key}: ${value}`;
  requireText(liveSmoke, header, `live smoke pin for ${key}`);
  requireText(outputSmoke, header, `output smoke pin for ${key}`);
  requireText(liveSmokeTest, `${JSON.stringify(key)}: ${JSON.stringify(value)}`, `live smoke fixture for ${key}`);
}
requireText(liveSmokeTest, "https://evil.example/today/", "cross-origin redirect rejection fixture");

const workflow = readFileSync(".github/workflows/vercel-production.yml", "utf8");
requireText(workflow, '[[ "$GITHUB_REF" == "refs/heads/main" ]]', "main-ref rejection gate");
requireText(workflow, '[[ "$GITHUB_SHA" == "$main_sha" ]]', "exact current-main SHA gate");
requireText(workflow, "Recognize already-verified production", "artifact-expiry idempotence check");
requireText(workflow, "sourcePipeline=github-actions-prebuilt-v1", "verified prebuilt deployment metadata");
requireText(workflow, "Current main is not already verified in production and its CI artifact is unavailable", "fail-closed artifact fallback");
requireText(workflow, 'bash scripts/smoke-vercel-live.sh "$PRODUCTION_URL"', "artifact-free production smoke");
requireText(workflow, 'if [[ "${{ steps.current_release.outputs.already_released }}" == "true" ]]; then', "artifact-free final smoke branch");
requireText(workflow, 'artifact_digest" != "${EXPECTED_ARTIFACT_DIGEST#sha256:}', "available-artifact digest comparison");
requireText(workflow, "REQUIRED_CI_JOBS: verify parser unit build e2e a11y privacy", "exact seven-job set");
requireCount(workflow, "for required_job in $REQUIRED_CI_JOBS; do", 2, "required-job validation loops");
const gatedSteps = [
  "Download and verify exact artifact archive", "Install pinned release tooling", "Create Build Output API v3 package",
  "Stage exact production deployment", "Smoke-check staged deployment", "Determine whether promotion is needed",
];
for (const name of gatedSteps) {
  requireText(workflow, `- name: ${name}\n        if: steps.current_release.outputs.already_released != 'true'`, `no-op gate for ${name}`);
}
console.log("Release contract checks passed");
