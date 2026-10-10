import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { parseTarballVersions } from './lib/html-directory-parser.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const GNU_FTP = 'https://ftp.gnu.org';

interface GnuSourceConfig {
  ftp_path: string;
}

export async function processGnuRelease(): Promise<void> {
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
        eq(schema.upstreamSources.sourceType, 'gnu'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'GNU release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as GnuSourceConfig;
      if (!cfg.ftp_path) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'GNU source missing ftp_path');
        continue;
      }

      // Derive product name from ftp_path (e.g., "/gnu/coreutils/" -> "coreutils")
      const pathParts = cfg.ftp_path.replace(/\/$/, '').split('/');
      const product = pathParts[pathParts.length - 1];

      const url = `${GNU_FTP}${cfg.ftp_path}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, product, status: response.status }, 'GNU FTP fetch failed');
        checked++;
        continue;
      }

      const html = await response.text();
      const versions = parseTarballVersions(html, product);

      if (versions.length === 0) {
        logger.debug({ sourceId: source.sourceId, product }, 'GNU: no tarball versions found');
        checked++;
        continue;
      }

      // Filter pre-releases and unstable branches, upsert the latest 5 stable versions
      const stable = versions.filter((v) =>
        !isPreRelease(v) && !isUnstableBranch(source.packageName, v, source.packageVersion)
      );
      for (const version of stable.slice(0, 5)) {
        const newer = isNewer(version, source.packageVersion);

        await db
          .insert(schema.upstreamReleases)
          .values({
            packageId: source.packageId,
            sourceId: source.sourceId,
            version,
            releaseUrl: `${url}${product}-${version}.tar.xz`,
            isNewer: newer,
          })
          .onConflictDoUpdate({
            target: [
              schema.upstreamReleases.packageId,
              schema.upstreamReleases.sourceId,
              schema.upstreamReleases.version,
            ],
            set: {
              releaseUrl: `${url}${product}-${version}.tar.xz`,
              isNewer: newer,
            },
          });

        if (newer) newReleases++;
        touched.add(source.packageName);
      }

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(1000);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'GNU release check failed');
    }
  }

  const { cleaned, rescored } = await runPostReleaseTasks('gnu', touched);

  logger.info({ checked, newReleases, cleaned, rescored }, 'GNU release checker: done');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
