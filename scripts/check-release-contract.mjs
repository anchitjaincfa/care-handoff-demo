import { readFileSync } from "node:fs";

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Release contract missing ${label}`);
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
if (vercelConfig.git?.deploymentEnabled !== false) throw new Error("Vercel Git auto-deploy must remain disabled");

const workflow = readFileSync(".github/workflows/vercel-production.yml", "utf8");
requireText(workflow, "if: github.ref == 'refs/heads/main'", "main-ref job gate");
requireText(workflow, '[[ "$GITHUB_SHA" == "$main_sha" ]]', "exact current-main SHA gate");
requireText(workflow, "Recognize already-verified production", "artifact-expiry idempotence check");
requireText(workflow, "sourcePipeline=github-actions-prebuilt-v1", "verified prebuilt deployment metadata");
requireText(workflow, "Current main is not already verified in production and its CI artifact is unavailable", "fail-closed artifact fallback");
requireText(workflow, "steps.current_release.outputs.already_released != 'true'", "no-op step gating");
console.log("Release contract checks passed");
