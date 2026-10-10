import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const FLATHUB_API = 'https://flathub.org/api/v2/appstream';

interface FlathubSourceConfig {
  app_id: string;
}

export async function processFlathubRelease(): Promise<void> {
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
        eq(schema.upstreamSources.sourceType, 'flathub'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'Flathub release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as FlathubSourceConfig;
      if (!cfg.app_id) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'Flathub source missing app_id');
        continue;
      }

      const url = `${FLATHUB_API}/${encodeURIComponent(cfg.app_id)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, app_id: cfg.app_id, status: response.status }, 'Flathub fetch failed');
        checked++;
        continue;
      }

      const data = await response.json() as {
        releases?: Array<{ version: string; timestamp?: number }>;
        version?: string;
      };

      // Flathub returns releases array; fall back to top-level version field
      const latestVersion = data.releases?.[0]?.version ?? data.version;
      if (!latestVersion) {
        logger.warn({ sourceId: source.sourceId, app_id: cfg.app_id }, 'Flathub: no version found in response');
        checked++;
        continue;
      }

      const releaseDate = data.releases?.[0]?.timestamp
        ? new Date(data.releases[0].timestamp * 1000)
        : null;

      const releaseUrl = `https://flathub.org/apps/${cfg.app_id}`;
      const newer = isNewer(latestVersion, source.packageVersion);

      await db
        .insert(schema.upstreamReleases)
        .values({
          packageId: source.packageId,
          sourceId: source.sourceId,
          version: latestVersion,
          releaseDate,
          releaseUrl,
          isNewer: newer,
        })
        .onConflictDoUpdate({
          target: [
            schema.upstreamReleases.packageId,
            schema.upstreamReleases.sourceId,
            schema.upstreamReleases.version,
          ],
          set: { releaseDate, releaseUrl, isNewer: newer },
        });

      if (newer) newReleases++;
      touched.add(source.packageName);

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(300);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'Flathub release check failed');
    }
  }

  const { cleaned, rescored } = await runPostReleaseTasks('flathub', touched);

  logger.info({ checked, newReleases, cleaned, rescored }, 'Flathub release checker: done');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
