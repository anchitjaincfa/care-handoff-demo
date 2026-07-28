import { readFile } from "node:fs/promises";
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const documentation = JSON.parse(await readFile("scripts/dependency-overrides.json", "utf8"));
const documented = Object.fromEntries(Object.entries(documentation).map(([name, entry]) => [name, entry.version]));
if (JSON.stringify(packageJson.overrides ?? {}) !== JSON.stringify(documented)) {
  console.error("package.json overrides must exactly match scripts/dependency-overrides.json");
  process.exit(1);
}
for (const [name, entry] of Object.entries(documentation)) {
  if (!entry.reason || !entry.advisories?.length) {
    console.error(`Override ${name} lacks a reason or advisory reference.`);
    process.exit(1);
  }
}
console.log("Dependency overrides are pinned and documented.");
