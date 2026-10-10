/**
 * Post-release tasks: run after a release-checker worker finishes processing
 * its sources. Performs, in order:
 *   1. Retroactive cleanup of obviously bad releases (pre-release, unstable
 *      branch, non-version tags) for the worker's source type.
 *   2. Authoritative `is_newer` recompute for every release row of every
 *      touched package, against the *current* `packages.version`. This is the
 *      single owner of `is_newer` and exists to defeat the race where a worker
 *      reads `source.packageVersion` into a snapshot at the start of its run
 *      and then writes a stale value minutes later, after a concurrent
 *      manifest push has already moved the installed version forward. Without
 *      this step a freshly-upgraded package can keep flapping back to
 *      `is_newer = true` until the next worker pass.
 *   3. Incremental staleness recompute for the same set of packages so the
 *      dashboard's "Outdated" count and the Updates list reflect the truth
 *      immediately, instead of drifting behind the hourly staleness-scorer.
 */
import { cleanupBadReleases } from './release-cleanup.js';
import { recalculateStaleness, recalculateIsNewer } from '../../services/staleness.js';
import { logger } from '../../utils/logger.js';

export async function runPostReleaseTasks(
  sourceType: string | null,
  touched: Set<string>,
): Promise<{ cleaned: number; flipped: number; rescored: number }> {
  let cleaned = 0;
  if (sourceType) {
    try {
      const result = await cleanupBadReleases(sourceType);
      cleaned = result.cleaned;
      for (const name of result.affectedNames) touched.add(name);
    } catch (err) {
      logger.error({ err, sourceType }, 'cleanupBadReleases failed');
    }
  }

  let flipped = 0;
  if (touched.size > 0) {
    try {
      flipped = await recalculateIsNewer([...touched]);
    } catch (err) {
      logger.error({ err, touchedCount: touched.size }, 'Post-release is_newer recompute failed');
    }
  }

  let rescored = 0;
  if (touched.size > 0) {
    try {
      rescored = await recalculateStaleness([...touched]);
    } catch (err) {
      logger.error({ err, touchedCount: touched.size }, 'Post-release staleness recompute failed');
    }
  }

  return { cleaned, flipped, rescored };
}
