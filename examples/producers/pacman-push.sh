#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
VIGIL_URL="${VIGIL_URL:-http://localhost:3000}"
API_KEY_ID="${API_KEY_ID:-}"
API_KEY_SECRET="${API_KEY_SECRET:-}"

usage() {
  printf 'Usage: %s [--dry-run]\n' "$0" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

: "${API_KEY_ID:?Set API_KEY_ID}"
: "${API_KEY_SECRET:?Set API_KEY_SECRET}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

field_value() {
  local key="$1"
  awk -v target="$key" '
    index($0, ":") {
      key = substr($0, 1, index($0, ":") - 1)
      gsub(/[[:space:]]+$/, "", key)
      if (key == target) {
        value = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", value)
        print value
        exit
      }
    }
  '
}

list_json() {
  local value="${1:-}"
  if [ -z "$value" ] || [ "$value" = "None" ]; then
    printf '[]'
    return
  fi
  printf '%s\n' "$value" | tr ' ' '\n' | awk 'NF' | jq -R . | jq -cs .
}

date_json_arg() {
  local value="${1:-}"
  if [ -z "$value" ] || [ "$value" = "None" ]; then
    printf ''
    return
  fi
  date -d "$value" --iso-8601=seconds 2>/dev/null || true
}

package_json() {
  local package_name="$1"
  local info version description architecture depends provides groups build_date install_date

  info="$(pacman -Qi "$package_name")"
  version="$(printf '%s\n' "$info" | field_value "Version")"
  description="$(printf '%s\n' "$info" | field_value "Description")"
  architecture="$(printf '%s\n' "$info" | field_value "Architecture")"
  depends="$(list_json "$(printf '%s\n' "$info" | field_value "Depends On")")"
  provides="$(list_json "$(printf '%s\n' "$info" | field_value "Provides")")"
  groups="$(list_json "$(printf '%s\n' "$info" | field_value "Groups")")"
  build_date="$(date_json_arg "$(printf '%s\n' "$info" | field_value "Build Date")")"
  install_date="$(date_json_arg "$(printf '%s\n' "$info" | field_value "Install Date")")"

  jq -cn \
    --arg name "$package_name" \
    --arg version "$version" \
    --arg description "$description" \
    --arg architecture "$architecture" \
    --arg build_date "$build_date" \
    --arg install_date "$install_date" \
    --argjson depends "$depends" \
    --argjson provides "$provides" \
    --argjson groups "$groups" \
    '{name:$name,version:$version,depends:$depends,provides:$provides,groups:$groups}
      + (if $description != "" and $description != "None" then {description:$description} else {} end)
      + (if $architecture != "" then {architecture:$architecture} else {} end)
      + (if $build_date != "" then {build_date:$build_date} else {} end)
      + (if $install_date != "" then {install_date:$install_date} else {} end)'
}

build_manifest() {
  while IFS= read -r package_name; do
    package_json "$package_name"
  done < <(pacman -Qq) | jq -cs '{packages:.}' | jq -c .
}

sign_body() {
  local timestamp="$1"
  local body="$2"
  printf '%s' "${timestamp}.${body}" | openssl dgst -sha256 -hmac "$API_KEY_SECRET" | awk '{print $NF}'
}

require_command pacman
require_command jq
require_command curl
require_command openssl

MANIFEST="$(build_manifest)"
TIMESTAMP="$(date +%s%3N)"
SIGNATURE="$(sign_body "$TIMESTAMP" "$MANIFEST")"

if [ "$DRY_RUN" -eq 1 ]; then
  {
    printf 'X-Api-Key-Id: %s\n' "$API_KEY_ID"
    printf 'X-Signature: %s\n' "$SIGNATURE"
    printf 'X-Timestamp: %s\n' "$TIMESTAMP"
  } >&2
  printf '%s\n' "$MANIFEST"
  exit 0
fi

TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT
printf '%s' "$MANIFEST" > "$TMPFILE"

RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -X POST "${VIGIL_URL%/}/api/v1/manifest" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key-Id: ${API_KEY_ID}" \
  -H "X-Signature: ${SIGNATURE}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  --data-binary @"$TMPFILE")"

HTTP_CODE="$(printf '%s\n' "$RESPONSE" | tail -n1)"
BODY="$(printf '%s\n' "$RESPONSE" | sed '$d')"

if [ "$HTTP_CODE" = "200" ]; then
  printf '%s\n' "$BODY" | jq .
else
  printf 'Manifest push failed with HTTP %s\n' "$HTTP_CODE" >&2
  printf '%s\n' "$BODY" >&2
  exit 1
fi
