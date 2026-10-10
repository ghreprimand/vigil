#!/usr/bin/env bash
#
# scan-fingerprints.sh - Hard gate: keep authored files plain ASCII and free
# of generated-text boilerplate.
#
# Greps the tree for non-ASCII typography (em-dash, en-dash, ellipsis char,
# curly quotes, arrow glyph, emoji ranges), boilerplate phrases, and
# co-author trailers. Exits nonzero on any match and prints every
# offending file:line. Runs in CI.
#
# Usage:
#   scripts/scan-fingerprints.sh [ROOT]      # scan ROOT (default: repo root)
#   scripts/scan-fingerprints.sh --selftest  # run the built-in fixture test
#
# This script is itself plain ASCII. The non-ASCII bytes it searches for
# are constructed at runtime via printf so the source stays ASCII-clean
# and does not trip its own scan.

set -u

CLEANUP_DIR=""
cleanup() { [ -n "$CLEANUP_DIR" ] && rm -rf "$CLEANUP_DIR"; }
trap cleanup EXIT

# --- arg parse ---------------------------------------------------------
ROOT="."
SELFTEST=0
case "${1:-}" in
  --selftest) SELFTEST=1 ;;
  "" ) : ;;
  * ) ROOT="$1" ;;
esac

# Build the non-ASCII glyph alternation at runtime (UTF-8 bytes).
# em-dash, en-dash, horizontal ellipsis, left/right double quote,
# left/right single quote, rightwards arrow.
GLYPHS="$(printf '\xe2\x80\x94\xe2\x80\x93\xe2\x80\xa6\xe2\x80\x9c\xe2\x80\x9d\xe2\x80\x98\xe2\x80\x99\xe2\x86\x92')"

# Phrase / marker patterns (ASCII, case-insensitive).
PHRASE_REGEX='As an AI|Here'\''s the|Let me |Co-Authored-By|Co-authored-by|Generated with'

# A broad "any non-ASCII byte" pass catches emoji and any other smart
# punctuation we did not enumerate. grep -P with \x80-\xFF flags any
# byte with the high bit set.
NONASCII_RANGE='[^\x00-\x7F]'

file_list() {
  # Exclusions for the fingerprint scan:
  #  - noise dirs (node_modules, .git, dist)
  #  - the scanner scripts themselves (they carry the phrase patterns)
  #  - public/vendor/: third-party minified bundles that contain non-ASCII
  #    bytes by nature. Only authored text is checked here.
  find "$1" \
    -type d \( -name node_modules -o -name .git -o -name dist \) -prune -o \
    -path '*/public/vendor/*' -prune -o \
    -type f \
      ! -name scan-denylist.sh \
      ! -name scan-fingerprints.sh \
      -print 2>/dev/null
}

scan_dir() {
  local root="$1"
  local rc=0
  local files
  files="$(file_list "$root")"
  [ -z "$files" ] && return 0

  # 1) Enumerated typographic glyphs (em/en dash, ellipsis, curly quotes, arrow).
  local ghits
  ghits="$(printf '%s\n' "$files" | LC_ALL=C xargs -r grep -n -H -o "[$GLYPHS]" 2>/dev/null)"
  if [ -n "$ghits" ]; then
    printf '%s\n' "$ghits" | while IFS= read -r line; do
      printf 'FINGERPRINT[glyph]: %s\n' "$line"
    done
    rc=1
  fi

  # 2) Any remaining non-ASCII byte (emoji and unenumerated unicode).
  local nhits
  nhits="$(printf '%s\n' "$files" | LC_ALL=C xargs -r grep -nP -H "$NONASCII_RANGE" 2>/dev/null)"
  if [ -n "$nhits" ]; then
    printf '%s\n' "$nhits" | while IFS= read -r line; do
      printf 'FINGERPRINT[non-ascii]: %s\n' "$line"
    done
    rc=1
  fi

  # 3) Telltale phrases and co-authorship markers.
  local phits
  phits="$(printf '%s\n' "$files" | xargs -r grep -E -i -n -H "$PHRASE_REGEX" 2>/dev/null)"
  if [ -n "$phits" ]; then
    printf '%s\n' "$phits" | while IFS= read -r line; do
      printf 'FINGERPRINT[phrase]: %s\n' "$line"
    done
    rc=1
  fi

  return $rc
}

selftest() {
  local d
  d="$(mktemp -d)"
  CLEANUP_DIR="$d"

  # clean fixture: plain ASCII only
  printf 'plain ascii line, no fingerprints here.\n' > "$d/clean.txt"
  if ! scan_dir "$d" >/dev/null 2>&1; then
    echo "SELFTEST FAIL: clean fixture flagged"
    return 1
  fi

  # dirty fixture: an em-dash and a co-author trailer
  printf 'an em%s dash sneaks in\nCo-Authored-By: someone\n' \
    "$(printf '\xe2\x80\x94')" > "$d/dirty.txt"
  if scan_dir "$d" >/dev/null 2>&1; then
    echo "SELFTEST FAIL: dirty fixture not flagged"
    return 1
  fi

  echo "SELFTEST PASS: clean passes, dirty fails"
  return 0
}

if [ "$SELFTEST" -eq 1 ]; then
  selftest
  exit $?
fi

echo "scan-fingerprints: scanning $ROOT"
if scan_dir "$ROOT"; then
  echo "scan-fingerprints: PASS (no fingerprints)"
  exit 0
else
  echo "scan-fingerprints: FAIL (fingerprints above)"
  exit 1
fi
