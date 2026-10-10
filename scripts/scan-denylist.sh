#!/usr/bin/env bash
#
# scan-denylist.sh - Hard gate: fail if any private term appears in the tree.
#
# The terms themselves are NOT stored in this repository. They are read from:
#   1. $DENYLIST_TERMS (newline-separated; CI sets this from a repo secret), or
#   2. the file named by $DENYLIST_FILE (default: scripts/denylist.local,
#      which is git-ignored).
# One term per line, matched case-insensitively as a fixed string. Prefix a
# line with "re:" to match it as an extended regex instead. Blank lines and
# lines starting with "#" are ignored. If no terms are configured, the scan
# is skipped (exit 0) so forks and fresh clones still pass CI.
#
# Matches are reported as file:line only, so the terms never reach logs.
#
# Usage:
#   scripts/scan-denylist.sh [ROOT]      # scan ROOT (default: repo root)
#   scripts/scan-denylist.sh --selftest  # run the built-in fixture test
#
# Plain ASCII only. No external deps beyond grep, find and git.

set -u

CLEANUP_DIR=""
cleanup() { [ -n "$CLEANUP_DIR" ] && rm -rf "$CLEANUP_DIR"; }
trap cleanup EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ROOT="."
SELFTEST=0
case "${1:-}" in
  --selftest) SELFTEST=1 ;;
  "" ) : ;;
  * ) ROOT="$1" ;;
esac

load_terms() {
  if [ -n "${DENYLIST_TERMS:-}" ]; then
    printf '%s\n' "$DENYLIST_TERMS"
  else
    local f="${DENYLIST_FILE:-$SCRIPT_DIR/denylist.local}"
    [ -f "$f" ] && cat "$f"
  fi | tr -d '\r' | grep -v -e '^[[:space:]]*$' -e '^[[:space:]]*#'
}

list_files() {
  # Tracked + untracked-but-not-ignored files when ROOT is a git work tree,
  # so local scratch dirs and ignored files (including the term file) are
  # never scanned. Falls back to find for plain directories.
  local root="$1"
  if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$root" ls-files -z --cached --others --exclude-standard \
      | tr '\0' '\n' | sed "s#^#$root/#"
  else
    find "$root" -type d \( -name node_modules -o -name .git -o -name dist \) -prune -o \
      -type f -print 2>/dev/null
  fi | grep -v -e '/denylist\.local$'
}

scan_dir() {
  # $1 = directory to scan, $2 = newline-separated terms
  local root="$1" terms="$2" rc=0 files term hits
  files="$(list_files "$root")"
  [ -z "$files" ] && return 0

  while IFS= read -r term; do
    [ -z "$term" ] && continue
    case "$term" in
      re:*) hits="$(printf '%s\n' "$files" | xargs -r -d '\n' grep -I -E -i -n -H -e "${term#re:}" 2>/dev/null)" ;;
      *)    hits="$(printf '%s\n' "$files" | xargs -r -d '\n' grep -I -F -i -n -H -e "$term" 2>/dev/null)" ;;
    esac
    if [ -n "$hits" ]; then
      printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/DENY: /'
      rc=1
    fi
  done <<EOF
$terms
EOF
  return $rc
}

selftest() {
  local d terms='synthetic-private-host
re:10\.99\.[0-9]+\.[0-9]+'
  d="$(mktemp -d)"
  CLEANUP_DIR="$d"

  printf 'hello world\nthis is a clean file\n' > "$d/clean.txt"
  if ! scan_dir "$d" "$terms" >/dev/null 2>&1; then
    echo "SELFTEST FAIL: clean fixture flagged"
    return 1
  fi

  printf 'deploy to root@SYNTHETIC-private-host\n' > "$d/dirty.txt"
  if scan_dir "$d" "$terms" >/dev/null 2>&1; then
    echo "SELFTEST FAIL: fixed-string fixture not flagged"
    return 1
  fi

  printf 'ok\n' > "$d/dirty.txt"
  printf 'addr 10.99.1.2\n' > "$d/dirty2.txt"
  if scan_dir "$d" "$terms" >/dev/null 2>&1; then
    echo "SELFTEST FAIL: regex fixture not flagged"
    return 1
  fi

  echo "SELFTEST PASS: clean passes, dirty fails"
  return 0
}

if [ "$SELFTEST" -eq 1 ]; then
  selftest
  exit $?
fi

TERMS="$(load_terms)"
if [ -z "$TERMS" ]; then
  echo "scan-denylist: no terms configured (DENYLIST_TERMS / scripts/denylist.local); skipping"
  exit 0
fi

echo "scan-denylist: scanning $ROOT ($(printf '%s\n' "$TERMS" | wc -l | tr -d ' ') terms)"
if scan_dir "$ROOT" "$TERMS"; then
  echo "scan-denylist: PASS (no denylist matches)"
  exit 0
else
  echo "scan-denylist: FAIL (denylist matches above)"
  exit 1
fi
