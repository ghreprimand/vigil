import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and, inArray, not } from 'drizzle-orm';
import { isNewer, compareVersions } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const MAX_BODY_BYTES = 512 * 1024; // 512KB

interface GenericSourceConfig {
  url: string;
  pattern: string;
  version_group?: number;
}

export async function processGenericRelease(): Promise<void> {
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
        eq(schema.upstreamSources.sourceType, 'generic'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'Generic release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  let stalePruned = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as GenericSourceConfig;
      if (!cfg.url || !cfg.pattern) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'Generic source missing url/pattern');
        continue;
      }

      // HTTPS only
      if (!cfg.url.startsWith('https://')) {
        logger.warn({ sourceId: source.sourceId, url: cfg.url }, 'Generic source rejected: HTTPS only');
        continue;
      }

      // Validate regex before use
      let regex: RegExp;
      try {
        regex = new RegExp(cfg.pattern, 'g');
      } catch {
        logger.warn({ sourceId: source.sourceId, pattern: cfg.pattern }, 'Generic source has invalid regex');
        continue;
      }

      const response = await fetch(cfg.url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, url: cfg.url, status: response.status }, 'Generic fetch failed');
        checked++;
        continue;
      }

      // Read limited body
      const reader = response.body?.getReader();
      if (!reader) {
        checked++;
        continue;
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          chunks.push(value);
          if (totalBytes >= MAX_BODY_BYTES) {
            reader.cancel().catch(() => {}); // suppress AbortError from cancelled stream
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }

      const body = new TextDecoder().decode(
        chunks.length === 1
          ? chunks[0]
          : concatUint8Arrays(chunks, totalBytes),
      );

      // Extract versions via regex
      const groupIdx = cfg.version_group ?? 1;
      const versions = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = regex.exec(body)) !== null) {
        const ver = match[groupIdx];
        if (ver && !isPreRelease(ver) && !isUnstableBranch(source.packageName, ver, source.packageVersion)) {
          versions.add(ver);
        }
      }

      if (versions.size === 0) {
        logger.debug({ sourceId: source.sourceId, packageName: source.packageName }, 'Generic: no versions matched');
        checked++;
        continue;
      }

      // Sort descending, take latest 5
      const sorted = [...versions].sort((a, b) => compareVersions(b, a));
      const top = sorted.slice(0, 5);

      for (const version of top) {
        const newer = isNewer(version, source.packageVersion);

        await db
          .insert(schema.upstreamReleases)
          .values({
            packageId: source.packageId,
            sourceId: source.sourceId,
            version,
            releaseUrl: cfg.url,
            isNewer: newer,
          })
          .onConflictDoUpdate({
            target: [
              schema.upstreamReleases.packageId,
              schema.upstreamReleases.sourceId,
              schema.upstreamReleases.version,
            ],
            set: {
              releaseUrl: cfg.url,
              isNewer: newer,
            },
          });

        if (newer) newReleases++;
        touched.add(source.packageName);
      }

      if (top.length > 0) {
        const result = await db
          .update(schema.upstreamReleases)
          .set({ isNewer: false })
          .where(
            and(
              eq(schema.upstreamReleases.sourceId, source.sourceId),
              eq(schema.upstreamReleases.isNewer, true),
              not(inArray(schema.upstreamReleases.version, top)),
            ),
          );
        const changed = (result as unknown as { changes?: number }).changes ?? 0;
        if (changed > 0) {
          stalePruned += changed;
          touched.add(source.packageName);
        }
      }

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(1000);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'Generic release check failed');
    }
  }

  const { cleaned, rescored } = await runPostReleaseTasks('generic', touched);

  logger.info({ checked, newReleases, stalePruned, cleaned, rescored }, 'Generic release checker: done');
}

function concatUint8Arrays(arrays: Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
