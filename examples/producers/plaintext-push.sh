#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
INPUT="-"
VIGIL_URL="${VIGIL_URL:-http://localhost:3000}"
API_KEY_ID="${API_KEY_ID:-}"
API_KEY_SECRET="${API_KEY_SECRET:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) printf 'Usage: %s [--dry-run] [file]\n' "$0"; exit 0 ;;
    *) INPUT="$1" ;;
  esac
  shift
done

: "${API_KEY_ID:?Set API_KEY_ID}"
: "${API_KEY_SECRET:?Set API_KEY_SECRET}"

command -v jq >/dev/null 2>&1 || { printf 'Missing required command: jq\n' >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { printf 'Missing required command: curl\n' >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { printf 'Missing required command: openssl\n' >&2; exit 1; }

read_input() {
  if [ "$INPUT" = "-" ]; then
    cat
  else
    cat "$INPUT"
  fi
}

MANIFEST="$(read_input | awk 'NF >= 2 && $1 !~ /^#/ { print $1 "\t" $2 }' | jq -Rn '[inputs | split("\t") | {name:.[0],version:.[1]}] | {packages:.}' | jq -c .)"
TIMESTAMP="$(date +%s%3N)"
SIGNATURE="$(printf '%s' "${TIMESTAMP}.${MANIFEST}" | openssl dgst -sha256 -hmac "$API_KEY_SECRET" | awk '{print $NF}')"

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
