import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const PYPI_API = 'https://pypi.org/pypi';

interface PypiSourceConfig {
  project: string;
}

export async function processPypiRelease(): Promise<void> {
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
        eq(schema.upstreamSources.sourceType, 'pypi'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'PyPI release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as PypiSourceConfig;
      if (!cfg.project) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'PyPI source missing project');
        continue;
      }

      const url = `${PYPI_API}/${encodeURIComponent(cfg.project)}/json`;
      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, project: cfg.project, status: response.status }, 'PyPI fetch failed');
        checked++;
        continue;
      }

      const data = await response.json() as {
        info: { version: string };
        releases: Record<string, Array<{ upload_time_iso_8601?: string }>>;
      };

      const latestVersion = data.info.version;
      if (!latestVersion || isPreRelease(latestVersion)) {
        checked++;
        continue;
      }

      // Skip unstable branches (e.g. Python dev releases)
      if (isUnstableBranch(source.packageName, latestVersion, source.packageVersion)) {
        checked++;
        continue;
      }

      const releaseFiles = data.releases[latestVersion];
      const releaseDate = releaseFiles?.[0]?.upload_time_iso_8601
        ? new Date(releaseFiles[0].upload_time_iso_8601)
        : null;

      const newer = isNewer(latestVersion, source.packageVersion);

      await db
        .insert(schema.upstreamReleases)
        .values({
          packageId: source.packageId,
          sourceId: source.sourceId,
          version: latestVersion,
          releaseDate,
          releaseUrl: `https://pypi.org/project/${encodeURIComponent(cfg.project)}/${latestVersion}/`,
          isNewer: newer,
        })
        .onConflictDoUpdate({
          target: [
            schema.upstreamReleases.packageId,
            schema.upstreamReleases.sourceId,
            schema.upstreamReleases.version,
          ],
          set: {
            releaseDate,
            releaseUrl: `https://pypi.org/project/${encodeURIComponent(cfg.project)}/${latestVersion}/`,
            isNewer: newer,
          },
        });

      if (newer) newReleases++;
      touched.add(source.packageName);

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(500);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'PyPI release check failed');
    }
  }

  const { cleaned, rescored } = await runPostReleaseTasks('pypi', touched);

  logger.info({ checked, newReleases, cleaned, rescored }, 'PyPI release checker: done');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
