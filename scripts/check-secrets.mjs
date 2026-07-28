import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["OpenAI secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const ignoredPaths = new Set(["package-lock.json"]);
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of files) {
  if (ignoredPaths.has(file) || (await stat(file)).size > 1_000_000) continue;
  const contents = await readFile(file, "utf8").catch(() => null);
  if (contents === null || contents.includes("\0")) continue;
  for (const [label, pattern] of patterns) {
    if (pattern.test(contents)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length) {
  console.error(`Potential secrets found:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`Secret canary scan passed across ${files.length} tracked files.`);
