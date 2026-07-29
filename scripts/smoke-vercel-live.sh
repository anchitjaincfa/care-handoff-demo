#!/usr/bin/env bash
set -euo pipefail

origin="${1%/}"
[[ "$origin" =~ ^https://[a-z0-9.-]+$ || "$origin" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
live_dir="$(mktemp -d)"

expect_header() {
  tr -d '\r' < "$1" | grep --fixed-strings --ignore-case --quiet "$2"
}

root_headers="$live_dir/root.headers"
curl --fail --silent --show-error --retry 3 --retry-all-errors \
  --dump-header "$root_headers" "$origin/" --output "$live_dir/root.html"
test -s "$live_dir/root.html"
expect_header "$root_headers" "Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests"
expect_header "$root_headers" "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload"
expect_header "$root_headers" "Referrer-Policy: no-referrer"
expect_header "$root_headers" "Permissions-Policy: camera=(), geolocation=(), payment=(), usb=()"
expect_header "$root_headers" "X-Content-Type-Options: nosniff"
expect_header "$root_headers" "X-Frame-Options: DENY"
expect_header "$root_headers" "Cross-Origin-Opener-Policy: same-origin"

today_headers="$live_dir/today.headers"
today_code="$(curl --silent --show-error --dump-header "$today_headers" --output /dev/null --write-out '%{http_code}' "$origin/today")"
[[ "$today_code" == "308" ]]
tr -d '\r' < "$today_headers" | grep --extended-regexp --ignore-case --quiet "^location: (${origin//./\\.})?/today/$"
curl --fail --silent --show-error "$origin/today/" --output "$live_dir/today.html"
test -s "$live_dir/today.html"

sw_headers="$live_dir/sw.headers"
curl --fail --silent --show-error --dump-header "$sw_headers" "$origin/sw.js" --output "$live_dir/sw.js"
test -s "$live_dir/sw.js"
expect_header "$sw_headers" "Cache-Control: public, max-age=0, must-revalidate"
expect_header "$sw_headers" "Service-Worker-Allowed: /"

manifest_headers="$live_dir/manifest.headers"
curl --fail --silent --show-error --dump-header "$manifest_headers" "$origin/manifest.webmanifest" --output "$live_dir/manifest.webmanifest"
jq --exit-status '.name and .start_url' "$live_dir/manifest.webmanifest" >/dev/null
expect_header "$manifest_headers" "Cache-Control: public, max-age=0, must-revalidate"
tr -d '\r' < "$manifest_headers" | grep --extended-regexp --ignore-case --quiet '^content-type: application/manifest\+json(; charset=utf-8)?$'

icon_headers="$live_dir/icon.headers"
curl --fail --silent --show-error --dump-header "$icon_headers" "$origin/icons/icon-192.png" --output "$live_dir/icon-192.png"
test -s "$live_dir/icon-192.png"
expect_header "$icon_headers" "Cache-Control: public, max-age=31536000, immutable"
