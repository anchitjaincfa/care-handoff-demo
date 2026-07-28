#!/usr/bin/env bash
set -euo pipefail

origin="${1%/}"
[[ "$origin" =~ ^https://[a-z0-9.-]+$ ]]

smoke_dir="$(mktemp -d)"
root_headers="$smoke_dir/root.headers"
root_body="$smoke_dir/root.html"

fetch_exact_root() {
  local attempt code

  for attempt in {1..12}; do
    code="$(
      curl --silent --show-error \
        --retry 2 --retry-all-errors \
        --dump-header "$root_headers" \
        --output "$root_body" \
        --write-out '%{http_code}' \
        "$origin/"
    )"

    if [[ "$code" == "200" ]] && cmp --silent out/index.html "$root_body"; then
      return 0
    fi

    sleep 5
  done

  return 1
}

expect_header() {
  local file="$1"
  local expected="$2"

  tr -d '\r' < "$file" | grep --fixed-strings --ignore-case --quiet "$expected"
}

fetch_exact_root

expect_header "$root_headers" "Content-Security-Policy:"
expect_header "$root_headers" \
  "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload"
expect_header "$root_headers" "Referrer-Policy: no-referrer"
expect_header "$root_headers" \
  "Permissions-Policy: camera=(), geolocation=(), payment=(), usb=()"
expect_header "$root_headers" "X-Content-Type-Options: nosniff"
expect_header "$root_headers" "X-Frame-Options: DENY"
expect_header "$root_headers" "Cross-Origin-Opener-Policy: same-origin"

today_headers="$smoke_dir/today.headers"
today_code="$(
  curl --silent --show-error \
    --dump-header "$today_headers" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$origin/today"
)"
[[ "$today_code" == "308" ]]
tr -d '\r' < "$today_headers" |
  grep --extended-regexp --ignore-case --quiet \
    '^location: (https://[^/]+)?/today/$'

today_code="$(
  curl --silent --show-error \
    --output "$smoke_dir/today.html" \
    --write-out '%{http_code}' \
    "$origin/today/"
)"
[[ "$today_code" == "200" ]]
cmp --silent out/today/index.html "$smoke_dir/today.html"

sw_headers="$smoke_dir/sw.headers"
curl --fail --silent --show-error \
  --dump-header "$sw_headers" \
  "$origin/sw.js" \
  --output "$smoke_dir/sw.js"
cmp --silent out/sw.js "$smoke_dir/sw.js"
expect_header "$sw_headers" \
  "Cache-Control: public, max-age=0, must-revalidate"
expect_header "$sw_headers" "Service-Worker-Allowed: /"

manifest_headers="$smoke_dir/manifest.headers"
curl --fail --silent --show-error \
  --dump-header "$manifest_headers" \
  "$origin/manifest.webmanifest" \
  --output "$smoke_dir/manifest.webmanifest"
cmp --silent out/manifest.webmanifest "$smoke_dir/manifest.webmanifest"
expect_header "$manifest_headers" \
  "Cache-Control: public, max-age=0, must-revalidate"
tr -d '\r' < "$manifest_headers" |
  grep --extended-regexp --ignore-case --quiet \
    '^content-type: application/manifest\+json(; charset=utf-8)?$'

asset_file="$(find out/_next/static -type f -print -quit)"
[[ -n "$asset_file" ]]
asset_path="${asset_file#out}"
asset_headers="$smoke_dir/asset.headers"
curl --fail --silent --show-error \
  --dump-header "$asset_headers" \
  "$origin$asset_path" \
  --output "$smoke_dir/asset"
cmp --silent "$asset_file" "$smoke_dir/asset"
expect_header "$asset_headers" \
  "Cache-Control: public, max-age=31536000, immutable"

icon_headers="$smoke_dir/icon.headers"
curl --fail --silent --show-error \
  --dump-header "$icon_headers" \
  "$origin/icons/icon-192.png" \
  --output "$smoke_dir/icon-192.png"
cmp --silent out/icons/icon-192.png "$smoke_dir/icon-192.png"
expect_header "$icon_headers" \
  "Cache-Control: public, max-age=31536000, immutable"
