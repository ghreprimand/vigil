import { db, schema } from '../db/index.js';
import { eq, sql, and, inArray, not } from 'drizzle-orm';
import { isNewer } from './version-compare.js';
import { isPreRelease, isUnstableBranch, matchesTagPattern } from '../workers/lib/version-filter.js';
import { logger } from '../utils/logger.js';

interface StalenessResult {
  packageId: number;
  score: number;
  versionsBehind: number;
  daysBehind: number;
  hasCve: boolean;
  maxCvss: number;
}

// Default group multipliers (all 1.0 = no change from base score)
const DEFAULT_MULTIPLIERS: Record<string, number> = {
  toolchain: 1.0,
  kde: 1.0,
  core: 1.0,
  apps: 1.0,
  security: 1.0,
};

/**
 * Get group-based score multipliers from settings, falling back to defaults.
 */
async function getGroupMultipliers(): Promise<Record<string, number>> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, 'staleness_group_multipliers'))
    .limit(1);

  if (row?.value && typeof row.value === 'object') {
    return { ...DEFAULT_MULTIPLIERS, ...(row.value as Record<string, number>) };
  }
  return { ...DEFAULT_MULTIPLIERS };
}

/**
 * Batch-load all data needed for staleness scoring, then compute scores in memory.
 * Replaces the per-package computePackageScore() N+1 pattern with 4 bulk queries.
 */
async function computeScoresBatch(
  packageIds: number[],
  multipliers: Record<string, number>,
): Promise<Map<number, StalenessResult>> {
  if (packageIds.length === 0) return new Map();

  // 1. Batch-load all newer upstream releases for these packages
  const newerReleases = await db
    .select({
      packageId: schema.upstreamReleases.packageId,
      version: schema.upstreamReleases.version,
      releaseDate: schema.upstreamReleases.releaseDate,
    })
    .from(schema.upstreamReleases)
    .where(
      and(
        inArray(schema.upstreamReleases.packageId, packageIds),
        eq(schema.upstreamReleases.isNewer, true),
      ),
    );

  // Group releases by packageId
  const releasesByPkg = new Map<number, { version: string; releaseDate: Date | null }[]>();
  for (const r of newerReleases) {
    if (!releasesByPkg.has(r.packageId)) {
      releasesByPkg.set(r.packageId, []);
    }
    releasesByPkg.get(r.packageId)!.push({ version: r.version, releaseDate: r.releaseDate });
  }

  // Only compute scores for packages that actually have newer releases
  const pkgIdsWithReleases = [...releasesByPkg.keys()];
  if (pkgIdsWithReleases.length === 0) return new Map();

  // 2. Batch-load all open CVE data for these packages
  const cveRows = await db
    .select({
      packageId: schema.packageVulnerabilities.packageId,
      cvssScore: schema.vulnerabilities.cvssScore,
    })
    .from(schema.packageVulnerabilities)
    .innerJoin(
      schema.vulnerabilities,
      eq(schema.packageVulnerabilities.vulnerabilityId, schema.vulnerabilities.id),
    )
    .where(
      and(
        inArray(schema.packageVulnerabilities.packageId, pkgIdsWithReleases),
        eq(schema.vulnerabilities.status, 'open'),
      ),
    );

  // Group CVE data by packageId
  const cveByPkg = new Map<number, { hasCve: boolean; maxCvss: number }>();
  for (const row of cveRows) {
    const existing = cveByPkg.get(row.packageId);
    if (existing) {
      existing.maxCvss = Math.max(existing.maxCvss, row.cvssScore ?? 0);
    } else {
      cveByPkg.set(row.packageId, { hasCve: true, maxCvss: row.cvssScore ?? 0 });
    }
  }

  // 3. Batch-load reverse dependency counts for these packages
  const revDepRows = await db
    .select({
      dependsOnId: schema.dependencyEdges.dependsOnId,
      count: sql<number>`count(*)`,
    })
    .from(schema.dependencyEdges)
    .where(inArray(schema.dependencyEdges.dependsOnId, pkgIdsWithReleases))
    .groupBy(schema.dependencyEdges.dependsOnId);

  const revDepByPkg = new Map<number, number>();
  for (const row of revDepRows) {
    revDepByPkg.set(row.dependsOnId, Number(row.count));
  }

  // 4. Batch-load package groups for multiplier application
  const hasNonDefaultMultiplier = Object.values(multipliers).some((v) => v !== 1.0);
  const groupsByPkg = new Map<number, string[]>();
  if (hasNonDefaultMultiplier) {
    const groupRows = await db
      .select({ id: schema.packages.id, groups: schema.packages.groups })
      .from(schema.packages)
      .where(inArray(schema.packages.id, pkgIdsWithReleases));

    for (const row of groupRows) {
      if (row.groups && Array.isArray(row.groups)) {
        groupsByPkg.set(row.id, row.groups as string[]);
      }
    }
  }

  // Compute scores in memory
  const results = new Map<number, StalenessResult>();

  for (const packageId of pkgIdsWithReleases) {
    const releases = releasesByPkg.get(packageId)!;

    // Distinct versions behind
    const distinctVersions = new Set(releases.map((r) => r.version));
    const versionsBehind = distinctVersions.size;

    // Days behind = days since the earliest newer release
    const releaseDates = releases
      .map((r) => r.releaseDate)
      .filter((d): d is Date => d !== null);
    const earliestDate = releaseDates.length > 0
      ? new Date(Math.min(...releaseDates.map((d) => d.getTime())))
      : new Date();
    const daysBehind = Math.max(0, Math.floor((Date.now() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)));

    // CVE info
    const cveInfo = cveByPkg.get(packageId) ?? { hasCve: false, maxCvss: 0 };

    // Reverse dependency count
    const reverseDepCount = revDepByPkg.get(packageId) ?? 0;

    // Compute base score (same formula as before)
    let score =
      (cveInfo.hasCve ? 10 : 0) +
      cveInfo.maxCvss * 2 +
      Math.min(versionsBehind * 3, 15) +
      Math.min(daysBehind / 30, 10) +
      Math.min(reverseDepCount / 10, 5);

    // Apply group multiplier if configured
    const groups = groupsByPkg.get(packageId);
    if (groups && groups.length > 0) {
      // Use the highest multiplier from any matching group
      let maxMult = 1.0;
      for (const g of groups) {
        if (multipliers[g] !== undefined && multipliers[g] > maxMult) {
          maxMult = multipliers[g];
        }
      }
      score *= maxMult;
    }

    results.set(packageId, {
      packageId,
      score: Math.round(score * 10) / 10, // 1 decimal place
      versionsBehind,
      daysBehind,
      hasCve: cveInfo.hasCve,
      maxCvss: cveInfo.maxCvss,
    });
  }

  return results;
}

/**
 * Compute staleness score for a single package.
 *
 * Score formula:
 *   (10 * has_cve) + (max_cvss * 2) + min(versions_behind * 3, 15)
 *   + min(days_behind / 30, 10) + min(reverse_dep_count / 10, 5)
 *
 * Max theoretical score: ~50.
 *
 * This is a convenience wrapper around computeScoresBatch() for single-package use.
 */
export async function computePackageScore(
  packageId: number,
  multipliers?: Record<string, number>,
): Promise<StalenessResult | null> {
  const mults = multipliers ?? await getGroupMultipliers();
  const results = await computeScoresBatch([packageId], mults);
  return results.get(packageId) ?? null;
}

/**
 * Recalculate staleness scores for specific packages (by name).
 * Used after manifest push for incremental updates.
 */
export async function recalculateStaleness(packageNames: string[]): Promise<number> {
  const multipliers = await getGroupMultipliers();
  const pkgs = await db
    .select({ id: schema.packages.id, name: schema.packages.name })
    .from(schema.packages)
    .where(inArray(schema.packages.name, packageNames));

  if (pkgs.length === 0) return 0;

  const packageIds = pkgs.map((p) => p.id);
  const results = await computeScoresBatch(packageIds, multipliers);

  // Upsert scores for packages that have newer releases
  let updated = 0;
  for (const result of results.values()) {
    await upsertScore(result);
    updated++;
  }

  // Remove scores for packages that are now up to date (had no newer releases)
  const scoredIds = new Set(results.keys());
  const upToDateIds = packageIds.filter((id) => !scoredIds.has(id));
  if (upToDateIds.length > 0) {
    await db
      .delete(schema.stalenessScores)
      .where(inArray(schema.stalenessScores.packageId, upToDateIds));
  }

  logger.info({ packageCount: packageNames.length, scoresUpdated: updated }, 'Staleness recalculated (incremental)');
  return updated;
}

/**
 * Re-stamp `is_newer` on every upstream_releases row for the given packages,
 * based on the *current* `packages.version`. This is the authoritative writer
 * of the `is_newer` column - release workers and the manifest-push handler
 * both call this after their own writes so any stale values left behind by
 * race conditions (worker snapshot vs. concurrent manifest push) are corrected
 * within the same transaction window.
 *
 * A row is `is_newer = true` iff the upstream version is strictly newer than
 * the installed version, still belongs to the current source config, matches
 * the current source tag pattern, and is not a pre-release or unstable branch
 * tag.
 *
 * Returns the number of rows whose value actually changed.
 */
export async function recalculateIsNewer(packageNames: string[]): Promise<number> {
  if (packageNames.length === 0) return 0;

  const pkgs = await db
    .select({
      id: schema.packages.id,
      name: schema.packages.name,
      version: schema.packages.version,
    })
    .from(schema.packages)
    .where(inArray(schema.packages.name, packageNames));

  if (pkgs.length === 0) return 0;

  let flipped = 0;
  for (const pkg of pkgs) {
    const releases = await db
      .select({
        id: schema.upstreamReleases.id,
        version: schema.upstreamReleases.version,
        releaseUrl: schema.upstreamReleases.releaseUrl,
        sourceType: schema.upstreamSources.sourceType,
        sourceConfig: schema.upstreamSources.config,
      })
      .from(schema.upstreamReleases)
      .innerJoin(schema.upstreamSources, eq(schema.upstreamReleases.sourceId, schema.upstreamSources.id))
      .where(eq(schema.upstreamReleases.packageId, pkg.id));

    for (const rel of releases) {
      const cfg = rel.sourceConfig as Record<string, unknown> | null;
      const shouldBeNewer =
        isNewer(rel.version, pkg.version) &&
        matchesCurrentSource(rel.sourceType, cfg, rel.releaseUrl) &&
        matchesTagPattern(rel.version, cfg?.tag_pattern) &&
        !isPreRelease(rel.version) &&
        !isUnstableBranch(pkg.name, rel.version, pkg.version);

      // Only update when the value would actually change, to avoid unnecessary writes.
      const result = await db
        .update(schema.upstreamReleases)
        .set({ isNewer: shouldBeNewer })
        .where(
          and(
            eq(schema.upstreamReleases.id, rel.id),
            eq(schema.upstreamReleases.isNewer, !shouldBeNewer),
          ),
        );
      // better-sqlite3 RunResult exposes changes; cast loosely to stay portable
      const changed = (result as unknown as { changes?: number }).changes ?? 0;
      flipped += changed;
    }
  }

  if (flipped > 0) {
    logger.info({ packagesChecked: pkgs.length, flipped }, 'is_newer flags recalculated');
  }
  return flipped;
}

function matchesCurrentSource(
  sourceType: string,
  config: Record<string, unknown> | null,
  releaseUrl: string | null,
): boolean {
  if (!config || !releaseUrl) return true;

  if (sourceType === 'github') {
    const owner = typeof config.owner === 'string' ? config.owner : null;
    const repo = typeof config.repo === 'string' ? config.repo : null;
    if (!owner || !repo) return true;
    return releaseUrl.includes(`github.com/${owner}/${repo}/`);
  }

  if (sourceType === 'generic') {
    const url = typeof config.url === 'string' ? config.url : null;
    if (!url) return true;
    return releaseUrl === url;
  }

  return true;
}

/**
 * Recalculate staleness scores for ALL packages.
 * Used by the hourly worker.
 */
export async function recalculateAllStaleness(): Promise<number> {
  const multipliers = await getGroupMultipliers();
  // Find all packages that have at least one newer upstream release
  const pkgs = await db
    .selectDistinct({ id: schema.upstreamReleases.packageId })
    .from(schema.upstreamReleases)
    .where(eq(schema.upstreamReleases.isNewer, true));

  const packageIds = pkgs.map((p) => p.id);

  // Compute all scores in batch (3-4 queries instead of 3 per package)
  const results = await computeScoresBatch(packageIds, multipliers);

  // Upsert all scores
  let scored = 0;
  for (const result of results.values()) {
    await upsertScore(result);
    scored++;
  }

  // Clean up scores for packages that are now up to date - bulk delete
  const scoredIds = [...results.keys()];
  if (scoredIds.length > 0) {
    await db
      .delete(schema.stalenessScores)
      .where(not(inArray(schema.stalenessScores.packageId, scoredIds)));
  } else {
    // No packages scored - clear all scores
    await db.delete(schema.stalenessScores);
  }

  logger.info({ packagesChecked: packageIds.length, scoresUpserted: scored }, 'Staleness recalculated (full)');
  return scored;
}

async function upsertScore(result: StalenessResult): Promise<void> {
  await db
    .insert(schema.stalenessScores)
    .values({
      packageId: result.packageId,
      score: result.score,
      versionsBehind: result.versionsBehind,
      daysBehind: result.daysBehind,
      hasCve: result.hasCve,
      maxCvss: result.maxCvss,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.stalenessScores.packageId,
      set: {
        score: result.score,
        versionsBehind: result.versionsBehind,
        daysBehind: result.daysBehind,
        hasCve: result.hasCve,
        maxCvss: result.maxCvss,
        computedAt: new Date(),
      },
    });
}
