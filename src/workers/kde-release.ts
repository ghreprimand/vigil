import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and, inArray } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { parseDirectoryVersions } from './lib/html-directory-parser.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const KDE_DOWNLOAD = 'https://download.kde.org/stable';
const QT_DOWNLOAD = 'https://download.qt.io/official_releases/qt';

interface KdeSourceConfig {
  product: string;
  component: string; // plasma, frameworks, release-service, or standalone app name
}

interface QtSourceConfig {
  product: string;
  major_minor?: string; // e.g. "6.8" - if omitted, we scan the top-level directory
}

// KDE component groups share a single version across many packages
const KDE_COMPONENTS = ['plasma', 'frameworks', 'release-service'] as const;
type KdeComponent = typeof KDE_COMPONENTS[number];

export async function processKdeRelease(): Promise<void> {
  // Process both KDE and Qt sources
  const sources = await db
    .select({
      sourceId: schema.upstreamSources.id,
      packageId: schema.upstreamSources.packageId,
      sourceType: schema.upstreamSources.sourceType,
      config: schema.upstreamSources.config,
      packageName: schema.packages.name,
      packageVersion: schema.packages.version,
    })
    .from(schema.upstreamSources)
    .innerJoin(schema.packages, eq(schema.upstreamSources.packageId, schema.packages.id))
    .where(
      and(
        inArray(schema.upstreamSources.sourceType, ['kde', 'qt']),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  const kdeSources = sources.filter((s) => s.sourceType === 'kde');
  const qtSources = sources.filter((s) => s.sourceType === 'qt');

  logger.info(
    { kde: kdeSources.length, qt: qtSources.length },
    'KDE/Qt release checker: processing sources',
  );

  let checked = 0;
  let newReleases = 0;
  const touchedKde = new Set<string>();
  const touchedQt = new Set<string>();

  // -- KDE component batching --
  // Group by component so we only fetch each component directory once
  const componentGroups = new Map<string, typeof kdeSources>();
  const standaloneSources: typeof kdeSources = [];

  for (const source of kdeSources) {
    const cfg = source.config as unknown as KdeSourceConfig;
    const comp = cfg.component;
    if (KDE_COMPONENTS.includes(comp as KdeComponent)) {
      const group = componentGroups.get(comp) ?? [];
      group.push(source);
      componentGroups.set(comp, group);
    } else {
      standaloneSources.push(source);
    }
  }

  // Process each KDE component group (one HTTP request per component)
  for (const [component, group] of componentGroups) {
    try {
      const url = `${KDE_DOWNLOAD}/${component}/`;
      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ component, status: response.status }, 'KDE component fetch failed');
        continue;
      }

      const html = await response.text();
      const allVersions = parseDirectoryVersions(html);
      const versions = allVersions.filter((v) => !isPreRelease(v));

      if (versions.length === 0) {
        logger.debug({ component }, 'KDE: no versions found in directory listing');
        continue;
      }

      const latestDir = versions[0]; // Already sorted descending
      // KDE Frameworks directories use two-part names like "6.23/" but the actual
      // release version is three-part "6.23.0" (the .0 patch component is implicit).
      // If KDE ever changes this convention (e.g., directories with three-part names
      // or non-zero patch versions), this heuristic will need to be updated - either
      // by checking the directory name format or parsing the release metadata inside.
      const latestVersion = component === 'frameworks'
        ? `${latestDir}.0`
        : latestDir;

      const releaseUrl = `${url}${latestDir}/`;

      for (const source of group) {
        const newer = isNewer(latestVersion, source.packageVersion);

        await db
          .insert(schema.upstreamReleases)
          .values({
            packageId: source.packageId,
            sourceId: source.sourceId,
            version: latestVersion,
            releaseUrl,
            isNewer: newer,
          })
          .onConflictDoUpdate({
            target: [
              schema.upstreamReleases.packageId,
              schema.upstreamReleases.sourceId,
              schema.upstreamReleases.version,
            ],
            set: {
              releaseUrl,
              isNewer: newer,
            },
          });

        if (newer) newReleases++;
        touchedKde.add(source.packageName);

        await db
          .update(schema.upstreamSources)
          .set({ lastChecked: new Date() })
          .where(eq(schema.upstreamSources.id, source.sourceId));

        checked++;
      }

      await sleep(2000);
    } catch (err) {
      logger.error({ err, component }, 'KDE component check failed');
    }
  }

  // Process standalone KDE apps (e.g. kdenlive, krita)
  for (const source of standaloneSources) {
    try {
      const cfg = source.config as unknown as KdeSourceConfig;
      const url = `${KDE_DOWNLOAD}/${cfg.product}/`;
      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, product: cfg.product, status: response.status }, 'KDE standalone fetch failed');
        checked++;
        continue;
      }

      const html = await response.text();
      const allVersions = parseDirectoryVersions(html);
      const versions = allVersions.filter((v) => !isPreRelease(v));

      if (versions.length === 0) {
        checked++;
        continue;
      }

      const latestVersion = versions[0];
      const newer = isNewer(latestVersion, source.packageVersion);

      await db
        .insert(schema.upstreamReleases)
        .values({
          packageId: source.packageId,
          sourceId: source.sourceId,
          version: latestVersion,
          releaseUrl: `${url}${latestVersion}/`,
          isNewer: newer,
        })
        .onConflictDoUpdate({
          target: [
            schema.upstreamReleases.packageId,
            schema.upstreamReleases.sourceId,
            schema.upstreamReleases.version,
          ],
          set: {
            releaseUrl: `${url}${latestVersion}/`,
            isNewer: newer,
          },
        });

      if (newer) newReleases++;
      touchedKde.add(source.packageName);

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(2000);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'KDE standalone check failed');
    }
  }

  // -- Qt releases --
  for (const source of qtSources) {
    try {
      const cfg = source.config as unknown as QtSourceConfig;

      if (cfg.major_minor) {
        // Fetch specific major.minor directory (e.g. qt/6.8/)
        const url = `${QT_DOWNLOAD}/${cfg.major_minor}/`;
        const response = await fetch(url, {
          headers: { 'User-Agent': brand.userAgent },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          logger.warn({ sourceId: source.sourceId, majorMinor: cfg.major_minor, status: response.status }, 'Qt fetch failed');
          checked++;
          continue;
        }

        const html = await response.text();
        const versions = parseDirectoryVersions(html);

        if (versions.length > 0) {
          const latestVersion = versions[0];
          const newer = isNewer(latestVersion, source.packageVersion);

          await db
            .insert(schema.upstreamReleases)
            .values({
              packageId: source.packageId,
              sourceId: source.sourceId,
              version: latestVersion,
              releaseUrl: `${url}${latestVersion}/`,
              isNewer: newer,
            })
            .onConflictDoUpdate({
              target: [
                schema.upstreamReleases.packageId,
                schema.upstreamReleases.sourceId,
                schema.upstreamReleases.version,
              ],
              set: {
                releaseUrl: `${url}${latestVersion}/`,
                isNewer: newer,
              },
            });

          if (newer) newReleases++;
          touchedQt.add(source.packageName);
        }
      } else {
        // Scan top-level to find latest major.minor, then get latest patch
        const topResponse = await fetch(`${QT_DOWNLOAD}/`, {
          headers: { 'User-Agent': brand.userAgent },
          signal: AbortSignal.timeout(15000),
        });

        if (!topResponse.ok) {
          checked++;
          continue;
        }

        const topHtml = await topResponse.text();
        const majorMinors = parseDirectoryVersions(topHtml);

        if (majorMinors.length > 0) {
          const latestMM = majorMinors[0];
          await sleep(1000);

          const patchResponse = await fetch(`${QT_DOWNLOAD}/${latestMM}/`, {
            headers: { 'User-Agent': brand.userAgent },
            signal: AbortSignal.timeout(15000),
          });

          if (patchResponse.ok) {
            const patchHtml = await patchResponse.text();
            const patchVersions = parseDirectoryVersions(patchHtml);

            if (patchVersions.length > 0) {
              const latestVersion = patchVersions[0];
              const newer = isNewer(latestVersion, source.packageVersion);

              await db
                .insert(schema.upstreamReleases)
                .values({
                  packageId: source.packageId,
                  sourceId: source.sourceId,
                  version: latestVersion,
                  releaseUrl: `${QT_DOWNLOAD}/${latestMM}/${latestVersion}/`,
                  isNewer: newer,
                })
                .onConflictDoUpdate({
                  target: [
                    schema.upstreamReleases.packageId,
                    schema.upstreamReleases.sourceId,
                    schema.upstreamReleases.version,
                  ],
                  set: {
                    releaseUrl: `${QT_DOWNLOAD}/${latestMM}/${latestVersion}/`,
                    isNewer: newer,
                  },
                });

              if (newer) newReleases++;
              touchedQt.add(source.packageName);
            }
          }
        }
      }

      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;
      await sleep(2000);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'Qt release check failed');
    }
  }

  const kdeResult = await runPostReleaseTasks('kde', touchedKde);
  const qtResult = await runPostReleaseTasks('qt', touchedQt);

  logger.info(
    {
      checked,
      newReleases,
      cleaned: kdeResult.cleaned + qtResult.cleaned,
      rescored: kdeResult.rescored + qtResult.rescored,
    },
    'KDE/Qt release checker: done',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
