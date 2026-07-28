#!/usr/bin/env bash
set -euo pipefail

repo_root="$(pwd)"
test_dir="$(mktemp -d)"
port_file="$test_dir/port"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

node - "$port_file" <<'NODE_SERVER' &
const http = require("node:http");
const fs = require("node:fs");
const portFile = process.argv[2];
const security = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};
const server = http.createServer((request, response) => {
  if (request.url === "/today") { response.writeHead(308, { Location: "/today/" }); response.end(); return; }
  if (request.url === "/sw.js") { response.writeHead(200, { "Cache-Control": "public, max-age=0, must-revalidate", "Service-Worker-Allowed": "/" }); response.end("self.addEventListener('fetch', () => {});"); return; }
  if (request.url === "/manifest.webmanifest") { response.writeHead(200, { "Cache-Control": "public, max-age=0, must-revalidate", "Content-Type": "application/manifest+json; charset=utf-8" }); response.end(JSON.stringify({ name: "NuzzleCue", start_url: "/" })); return; }
  if (request.url === "/icons/icon-192.png") { response.writeHead(200, { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": "image/png" }); response.end("png"); return; }
  if (request.url === "/" || request.url === "/today/") { response.writeHead(200, security); response.end("<!doctype html><title>NuzzleCue</title>"); return; }
  response.writeHead(404); response.end();
});
server.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(server.address().port)));
NODE_SERVER
server_pid="$!"
for _ in {1..100}; do [[ -s "$port_file" ]] && break; sleep 0.05; done
test -s "$port_file"
mkdir "$test_dir/no-out"
(
  cd "$test_dir/no-out"
  test ! -e out
  bash "$repo_root/scripts/smoke-vercel-live.sh" "http://127.0.0.1:$(cat "$port_file")"
  test ! -e out
)
