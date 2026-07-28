import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const canonical = await readFile(path.join(root, "sw", "service-worker.js"), "utf8");
const developmentCopy = await readFile(path.join(root, "public", "sw.js"), "utf8");

if (canonical !== developmentCopy) {
  console.error("public/sw.js is stale; copy sw/service-worker.js before committing.");
  process.exit(1);
}
console.log("Service-worker canonical source and development copy are in sync.");
