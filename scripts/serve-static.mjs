import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const requestedRoot = process.argv[2] ?? "out";
const root = path.resolve(process.cwd(), requestedRoot);
const host = process.env.STATIC_HOST ?? "127.0.0.1";
const port = Number(process.env.STATIC_PORT ?? 4173);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

const vercelConfig = JSON.parse(await readFile(path.resolve("vercel.json"), "utf8"));
const regexCharacters = new Set(["\\", "^", "$", ".", "|", "?", "*", "+", "(", ")", "[", "]", "{", "}"]);
function escapeRegex(value) {
  return [...value].map((character) => regexCharacters.has(character) ? `\\${character}` : character).join("");
}
const headerRules = (vercelConfig.headers ?? []).map((rule) => {
  const escaped = rule.source.split("(.*)").map(escapeRegex).join(".*");
  return { pattern: new RegExp(`^${escaped}$`), headers: rule.headers };
});

function productionHeaders(pathname) {
  const headers = {};
  for (const rule of headerRules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const header of rule.headers) headers[header.key] = header.value;
  }
  if (!("Cache-Control" in headers)) headers["Cache-Control"] = "no-store";
  return headers;
}

async function resolveRequestPath(pathname) {
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  const candidates = pathname.endsWith("/")
    ? [path.join(candidate, "index.html")]
    : [candidate, path.join(candidate, "index.html")];
  for (const file of candidates) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {}
  }
  return null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const file = await resolveRequestPath(pathname);
    if (!file) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        ...productionHeaders(pathname),
      }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(file)) ?? "application/octet-stream",
      ...productionHeaders(pathname),
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Static export available at http://${host}:${port}`);
});
