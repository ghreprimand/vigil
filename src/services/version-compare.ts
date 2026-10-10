import * as semver from 'semver';

/**
 * Compare two version strings. Returns:
 *  -1 if a < b
 *   0 if a == b
 *   1 if a > b
 *
 * Handles semver, epoch:version-release (pacman), and fallback string comparison.
 */
export function compareVersions(a: string, b: string): number {
  // Strip epoch prefix (e.g., "1:2.3.4-1" -> "2.3.4-1")
  const stripEpoch = (v: string) => {
    const match = v.match(/^(\d+):(.+)$/);
    return match ? { epoch: parseInt(match[1], 10), version: match[2] } : { epoch: 0, version: v };
  };

  const pa = stripEpoch(a);
  const pb = stripEpoch(b);

  if (pa.epoch !== pb.epoch) return pa.epoch > pb.epoch ? 1 : -1;

  // Strip pacman release suffix (e.g., "6.6.1-1" -> "6.6.1")
  const stripRelease = (v: string) => v.replace(/-\d+$/, '');
  const va = stripRelease(pa.version);
  const vb = stripRelease(pb.version);

  // Handle git snapshot vs date-based versions
  // e.g. "0.0_git20260120.386b5f5" vs "2026_01_20"
  const dateA = extractDateInt(va);
  const dateB = extractDateInt(vb);
  if (dateA && dateB) {
    return dateA === dateB ? 0 : dateA > dateB ? 1 : -1;
  }

  // Try semver first
  const sa = semver.coerce(va);
  const sb = semver.coerce(vb);
  if (sa && sb) {
    return semver.compare(sa, sb);
  }

  // Fallback: segment-by-segment comparison
  const segA = va.split(/[.\-_]/).map(toComparable);
  const segB = vb.split(/[.\-_]/).map(toComparable);
  const len = Math.max(segA.length, segB.length);

  for (let i = 0; i < len; i++) {
    const x = segA[i] ?? { num: 0, str: '' };
    const y = segB[i] ?? { num: 0, str: '' };

    if (x.num !== undefined && y.num !== undefined) {
      if (x.num !== y.num) return x.num > y.num ? 1 : -1;
    }

    if (x.str !== y.str) return x.str > y.str ? 1 : -1;
  }

  return 0;
}

/**
 * Extract a YYYYMMDD integer from date-based version strings.
 * Handles: "0.0_git20260120.hash" -> 20260120, "2026_01_20" -> 20260120,
 *          "2026.01.20" -> 20260120, "2026-01-20" -> 20260120
 * Returns null if the version doesn't look date-based.
 */
function extractDateInt(v: string): number | null {
  // Git snapshot: 0.0_git20260120.hash or X.Y_gitYYYYMMDD...
  const gitMatch = v.match(/_git(\d{4})(\d{2})(\d{2})/);
  if (gitMatch) return parseInt(gitMatch[1] + gitMatch[2] + gitMatch[3], 10);

  // Date-based tag: YYYY_MM_DD, YYYY.MM.DD, YYYY-MM-DD
  const dateMatch = v.match(/^(\d{4})[._-](\d{1,2})[._-](\d{1,2})$/);
  if (dateMatch) return parseInt(dateMatch[1] + dateMatch[2] + dateMatch[3], 10);

  return null;
}

function toComparable(seg: string): { num: number; str: string } {
  const n = parseInt(seg, 10);
  return isNaN(n) ? { num: 0, str: seg } : { num: n, str: '' };
}

export function isNewer(upstream: string, installed: string): boolean {
  return compareVersions(upstream, installed) > 0;
}
