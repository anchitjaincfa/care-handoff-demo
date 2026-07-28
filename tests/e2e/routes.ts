import { readdirSync } from "node:fs";
import path from "node:path";

const FRAMEWORK_ROUTES = new Set(["/404/", "/_not-found/"]);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

export function exportedRoutes(outputDirectory = path.resolve("out")): string[] {
  const routes = walk(outputDirectory)
    .filter((file) => path.basename(file) === "index.html")
    .map((file) => {
      const relativeDirectory = path.relative(outputDirectory, path.dirname(file)).split(path.sep).join("/");
      return relativeDirectory ? `/${relativeDirectory}/` : "/";
    })
    .filter((route) => !FRAMEWORK_ROUTES.has(route));
  return [...new Set(routes)].sort();
}
