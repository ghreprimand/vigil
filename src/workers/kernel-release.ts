import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const KERNEL_RELEASES_URL = 'https://www.kernel.org/releases.json';

interface KernelSourceConfig {
  branch: 'mainline' | 'stable' | 'longterm';
}

interface KernelRelease {
  version: string;
  moniker: string;
  source: string;
  released?: { isodate: string };
  iseol?: boolean;
}

export async function processKernelRelease(): Promise<void> {
  // Find all enabled kernel upstream sources
  const sources = await db
    .select({
      sourceId: schema.upstreamSources.id,
      packageId: schema.upstreamSources.packageId,
      config: schema.upstreamSources.config,
      packageName: schema.packages.name,
      packageVersion: schema.packages.version,
    })
    .from(schema.upstreamSources)
    .innerJoin(schema.packages, eq(schema.upstreamSources.packageId, schema.packages.id))
    .where(
      and(
        eq(schema.upstreamSources.sourceType, 'kernel'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  if (sources.length === 0) {
    logger.info('Kernel release checker: no kernel sources configured');
    return;
  }

  // Fetch kernel.org releases (single request for all sources)
  const response = await fetch(KERNEL_RELEASES_URL, {
    headers: { 'User-Agent': brand.userAgent },
  });

  if (!response.ok) {
    throw new Error(`kernel.org API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { releases: KernelRelease[] };
  const releases = data.releases || [];

  logger.info({ releaseCount: releases.length, sourceCount: sources.length }, 'Kernel release checker: processing');

  const touched = new Set<string>();

  for (const source of sources) {
    const cfg = source.config as unknown as KernelSourceConfig;
    const branch = cfg.branch || 'longterm';

    // Filter releases by branch/moniker
    const matching = releases.filter((r) => {
      if (branch === 'mainline') return r.moniker === 'mainline';
      if (branch === 'stable') return r.moniker === 'stable';
      if (branch === 'longterm') return r.moniker === 'longterm';
      return false;
    });

    for (const release of matching) {
      if (!release.version || release.iseol) continue;

      const newer = isNewer(release.version, source.packageVersion);

      await db
        .insert(schema.upstreamReleases)
        .values({
          packageId: source.packageId,
          sourceId: source.sourceId,
          version: release.version,
          releaseDate: release.released?.isodate ? new Date(release.released.isodate) : null,
          releaseUrl: release.source || null,
          isNewer: newer,
        })
        .onConflictDoUpdate({
          target: [
            schema.upstreamReleases.packageId,
            schema.upstreamReleases.sourceId,
            schema.upstreamReleases.version,
          ],
          set: {
            releaseDate: release.released?.isodate ? new Date(release.released.isodate) : null,
            isNewer: newer,
          },
        });

      touched.add(source.packageName);
    }

    // Update last_checked
    await db
      .update(schema.upstreamSources)
      .set({ lastChecked: new Date() })
      .where(eq(schema.upstreamSources.id, source.sourceId));

    logger.info(
      { packageName: source.packageName, branch, matchingReleases: matching.length },
      'Kernel release check done',
    );
  }

  // Incremental staleness recompute for touched packages.
  // Pass null for sourceType because the kernel worker has no bad-release cleanup
  // (kernel.org versions are never pre-release tags).
  const { rescored } = await runPostReleaseTasks(null, touched);
  if (rescored > 0) {
    logger.info({ rescored }, 'Kernel release checker: staleness rescored');
  }
}
