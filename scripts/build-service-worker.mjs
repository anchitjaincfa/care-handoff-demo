import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "out");
const sourcePath = path.join(root, "sw", "service-worker.js");
const outputPath = path.join(outputDirectory, "sw.js");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(absolute));
    else if (entry.isFile()) paths.push(absolute);
  }
  return paths;
}

const files = (await walk(outputDirectory))
  .filter((file) => file !== outputPath && !file.endsWith(".map"))
  .sort();
const urls = new Set();
const fingerprintParts = [];

for (const file of files) {
  const relative = path.relative(outputDirectory, file).split(path.sep).join("/");
  const url = `/${relative}`;
  urls.add(url);
  if (relative === "index.html") urls.add("/");
  if (relative.endsWith("/index.html")) {
    urls.add(`/${relative.slice(0, -"index.html".length)}`);
  }
  fingerprintParts.push(`${relative}:${(await stat(file)).size}`);
}

const buildId = createHash("sha256")
  .update(fingerprintParts.join("\n"))
  .digest("hex")
  .slice(0, 16);
const source = await readFile(sourcePath, "utf8");
const withManifest = source.replace(
  /\/\* __PRECACHE_MANIFEST__ \*\/[\s\S]*?;\nconst OFFLINE_FALLBACKS/,
  `/* __PRECACHE_MANIFEST__ */ ${JSON.stringify([...urls].sort(), null, 2)};\nconst OFFLINE_FALLBACKS`,
);
const generated = withManifest.replaceAll("__BUILD_ID__", buildId);

if (generated === source) {
  throw new Error("Service worker generation markers were not replaced");
}
await writeFile(outputPath, generated);
console.log(`Generated sw.js with ${urls.size} precached URLs (${buildId}).`);
