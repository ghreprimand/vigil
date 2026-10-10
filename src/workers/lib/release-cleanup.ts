/**
 * Retroactive cleanup: mark existing releases as not-newer if they fail
 * the improved version filters. Called by workers after processing to
 * fix historical bad data.
 */
import { db, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { isPreRelease, isUnstableBranch, matchesTagPattern } from './version-filter.js';
import { logger } from '../../utils/logger.js';

/**
 * For each package with upstream releases, check if any releases marked is_newer=true
 * should actually be filtered out (pre-release, unstable branch, etc.).
 * If so, set is_newer=false so they stop appearing in the outdated count.
 *
 * Returns the number cleaned plus the names of packages whose releases were
 * mutated, so the caller can feed them into a staleness recompute.
 */
export async function cleanupBadReleases(
  sourceType: string,
): Promise<{ cleaned: number; affectedNames: string[] }> {
  // Get all releases marked as newer for this source type
  const releases = await db
    .select({
      releaseId: schema.upstreamReleases.id,
      version: schema.upstreamReleases.version,
      sourceConfig: schema.upstreamSources.config,
      packageName: schema.packages.name,
      packageVersion: schema.packages.version,
    })
    .from(schema.upstreamReleases)
    .innerJoin(schema.upstreamSources, eq(schema.upstreamReleases.sourceId, schema.upstreamSources.id))
    .innerJoin(schema.packages, eq(schema.upstreamReleases.packageId, schema.packages.id))
    .where(
      and(
        eq(schema.upstreamReleases.isNewer, true),
        eq(schema.upstreamSources.sourceType, sourceType),
      ),
    );

  let cleaned = 0;
  const affected = new Set<string>();

  for (const rel of releases) {
    const shouldFilter =
      isPreRelease(rel.version) ||
      isUnstableBranch(rel.packageName, rel.version, rel.packageVersion) ||
      !matchesTagPattern(rel.version, (rel.sourceConfig as Record<string, unknown> | null)?.tag_pattern) ||
      !/^\d/.test(rel.version); // non-version strings (e.g. CVE-named tags)

    if (shouldFilter) {
      await db
        .update(schema.upstreamReleases)
        .set({ isNewer: false })
        .where(eq(schema.upstreamReleases.id, rel.releaseId));
      cleaned++;
      affected.add(rel.packageName);
    }
  }

  if (cleaned > 0) {
    logger.info({ sourceType, cleaned }, 'Cleaned up bad releases (set is_newer=false)');
  }

  return { cleaned, affectedNames: [...affected] };
}
