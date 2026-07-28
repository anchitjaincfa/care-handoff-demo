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
const findings = [];
function scan(label, path, contents) {
  if (ignoredPaths.has(path) || contents.includes("\0")) return;
  for (const [name, pattern] of patterns) if (pattern.test(contents)) findings.push(`${label}:${path}: ${name}`);
}
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) {
  if (ignoredPaths.has(file) || (await stat(file)).size > 1_000_000) continue;
  const contents = await readFile(file, "utf8").catch(() => null);
  if (contents !== null) scan("HEAD", file, contents);
}
if (process.argv.includes("--history")) {
  const objects = execFileSync("git", ["rev-list", "--objects", "--all"], { encoding: "utf8", maxBuffer: 20_000_000 }).trim().split("\n").filter(Boolean);
  const seen = new Set();
  for (const line of objects) {
    const separator = line.indexOf(" ");
    if (separator < 0) continue;
    const sha = line.slice(0, separator), path = line.slice(separator + 1);
    if (seen.has(sha) || ignoredPaths.has(path)) continue;
    seen.add(sha);
    if (execFileSync("git", ["cat-file", "-t", sha], { encoding: "utf8" }).trim() !== "blob") continue;
    if (Number(execFileSync("git", ["cat-file", "-s", sha], { encoding: "utf8" })) > 1_000_000) continue;
    scan(sha.slice(0, 12), path, execFileSync("git", ["cat-file", "-p", sha], { encoding: "utf8", maxBuffer: 2_000_000 }));
  }
}
if (findings.length) { console.error(`Potential secrets found:\n${findings.join("\n")}`); process.exit(1); }
console.log(`Secret canary scan passed across ${files.length} tracked files${process.argv.includes("--history") ? " and Git history" : ""}.`);
