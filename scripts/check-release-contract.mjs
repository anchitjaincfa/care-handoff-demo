import { readFileSync } from "node:fs";

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Release contract missing ${label}`);
}
function requireCount(text, fragment, expected, label) {
  const actual = text.split(fragment).length - 1;
  if (actual !== expected) throw new Error(`Release contract expected ${expected} ${label}, found ${actual}`);
}
function requireOrder(text, fragments, label) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, cursor + 1);
    if (next === -1) throw new Error("Release contract ordering failed: " + label);
    cursor = next;
  }
}

function forbidText(text, fragment, label) {
  if (text.includes(fragment)) throw new Error(`Release contract still contains forbidden ${label}`);
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
const gitDeploymentRules = vercelConfig.git?.deploymentEnabled;
if (!gitDeploymentRules || typeof gitDeploymentRules !== "object" || Array.isArray(gitDeploymentRules)
    || gitDeploymentRules["**"] !== false || gitDeploymentRules.main !== true
    || Object.keys(gitDeploymentRules).sort().join(",") !== "**,main") {
  throw new Error("Vercel Git deployment must remain disabled for every branch except main");
}

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
requireText(workflow, 'if [[ "$already_released" == "true" ]]; then', "artifact-free final smoke branch");
requireText(workflow, 'artifact_digest" != "${EXPECTED_ARTIFACT_DIGEST#sha256:}', "available-artifact digest comparison");
requireText(workflow, "REQUIRED_CI_JOBS: verify parser unit build e2e a11y privacy", "exact seven-job set");
requireCount(workflow, "for required_job in $REQUIRED_CI_JOBS; do", 2, "required-job validation loops");
forbidText(workflow, "Determine whether promotion is needed", "byte-only promotion skip");
forbidText(workflow, "steps.promotion.outputs.required", "conditional promotion output");
requireText(workflow, 'echo "deployment_host=$resolved_host"', "recognized canonical deployment output");
requireText(workflow, 'CI_RUN_ID: ${{ steps.current_release.outputs.ci_run_id || steps.provenance.outputs.ci_run_id }}', "recognized CI provenance fallback");
requireText(workflow, 'STATIC_DIGEST: ${{ steps.current_release.outputs.static_digest || steps.package.outputs.static_digest }}', "recognized static digest fallback");
requireText(workflow, 'CONFIG_DIGEST: ${{ steps.current_release.outputs.config_digest || steps.package.outputs.config_digest }}', "recognized config digest fallback");
requireText(workflow, '"$resolved_host" == "$expected_host"', "exact promoted deployment identity check");
requireText(workflow, '"$deployed_sha" == "$SOURCE_SHA"', "post-promotion source SHA check");
requireText(workflow, '"$deployed_artifact" == "$artifact_hex"', "post-promotion artifact digest check");
requireText(workflow, '"$deployed_static" == "$static_hex"', "post-promotion static digest check");
requireText(workflow, '"$deployed_config" == "$config_hex"', "post-promotion config digest check");
requireCount(workflow, 'bash scripts/smoke-vercel-output.sh "$PRODUCTION_URL"', 1, "post-promotion byte smoke");
requireText(workflow, "validate_production_alias() {", "reusable production identity validator");
requireCount(workflow, "validate_production_alias || {", 2, "terminal production identity validations");
const finalReleaseStepOffset = workflow.indexOf("- name: Verify production alias identity and content");
if (finalReleaseStepOffset < 0) throw new Error("Release contract missing final production verification step");
const finalReleaseStep = workflow.slice(finalReleaseStepOffset);
requireOrder(finalReleaseStep, [
  "validate_production_alias || {",
  "bash scripts/smoke-vercel-output.sh",
  "final_main_sha=",
  "validate_production_alias || {",
  "echo \"production_url=",
], "identity validation before smoke and terminal validation after smoke plus main recheck");
const finalNoOpBranchOffset = finalReleaseStep.indexOf('if [[ "$already_released" == "true" ]]; then', finalReleaseStep.indexOf("validate_production_alias || {"));
if (finalNoOpBranchOffset < 0) throw new Error("Release contract missing final already-released branch");
requireOrder(finalReleaseStep.slice(finalNoOpBranchOffset), [
  'bash scripts/smoke-vercel-live.sh "$PRODUCTION_URL"',
  "final_main_sha=",
  "validate_production_alias || {",
  "echo \"production_url=",
], "terminal no-op identity validation after live smoke plus main recheck");
forbidText(finalReleaseStep, 'if [[ "$already_released" != "true" ]]; then', "terminal identity validation gated away from no-op releases");
const gatedSteps = [
  "Download and verify exact artifact archive", "Install pinned release tooling", "Create Build Output API v3 package",
  "Stage exact production deployment", "Smoke-check staged deployment", "Revalidate main and promote",
];
for (const name of gatedSteps) {
  requireText(workflow, `- name: ${name}\n        if: steps.current_release.outputs.already_released != 'true'`, `no-op gate for ${name}`);
}
console.log("Release contract checks passed");
