import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and } from 'drizzle-orm';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

interface GitlabSourceConfig {
  instance: string;
  project: string;
  tag_prefix?: string;
  tag_pattern?: string;
}

export async function processGitlabRelease(): Promise<void> {
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
        eq(schema.upstreamSources.sourceType, 'gitlab'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'GitLab release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as GitlabSourceConfig;
      if (!cfg.instance || !cfg.project) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'GitLab source missing instance/project');
        continue;
      }

      const encodedProject = encodeURIComponent(cfg.project);
      const url = `${cfg.instance}/api/v4/projects/${encodedProject}/repository/tags?per_page=20`;

      const response = await fetch(url, {
        headers: { 'User-Agent': brand.userAgent },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn({ sourceId: source.sourceId, project: cfg.project, status: response.status }, 'GitLab fetch failed');
        checked++;
        continue;
      }

      const tags = await response.json() as Array<{
        name: string;
        commit: { created_at?: string };
      }>;

      for (const tag of tags.slice(0, 10)) {
        let version = tag.name;

        // Strip tag prefix BEFORE pre-release check - package names in prefixes
        // can contain false-positive keywords (e.g., "libevdev-" contains "dev",
        // "libXpresent-" contains "pre")
        if (cfg.tag_prefix && version.startsWith(cfg.tag_prefix)) {
          version = version.slice(cfg.tag_prefix.length);
        }

        // Apply tag pattern regex
        if (cfg.tag_pattern) {
          const match = version.match(new RegExp(cfg.tag_pattern));
          if (match && match[1]) {
            version = match[1];
          } else {
            continue;
          }
        }

        // Strip leading 'v'
        if (version.startsWith('v')) {
          version = version.slice(1);
        }

        if (!version) continue;

        // Skip pre-releases again after prefix stripping (catches more patterns)
        if (isPreRelease(version)) continue;

        // Skip GNOME/Perl/Python unstable branches
        if (isUnstableBranch(source.packageName, version, source.packageVersion)) continue;

        // Skip anything that doesn't look like a version number (e.g. CVE-named tags)
        if (!/^\d/.test(version)) continue;

        const newer = isNewer(version, source.packageVersion);

        await db
          .insert(schema.upstreamReleases)
          .values({
            packageId: source.packageId,
            sourceId: source.sourceId,
            version,
            releaseDate: tag.commit.created_at ? new Date(tag.commit.created_at) : null,
            releaseUrl: `${cfg.instance}/${cfg.project}/-/tags/${tag.name}`,
            isNewer: newer,
          })
          .onConflictDoUpdate({
            target: [
              schema.upstreamReleases.packageId,
              schema.upstreamReleases.sourceId,
              schema.upstreamReleases.version,
            ],
            set: {
              releaseDate: tag.commit.created_at ? new Date(tag.commit.created_at) : null,
              releaseUrl: `${cfg.instance}/${cfg.project}/-/tags/${tag.name}`,
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
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'GitLab release check failed');
    }
  }

  // Retroactive cleanup + incremental staleness recompute for touched packages
  const { cleaned, rescored } = await runPostReleaseTasks('gitlab', touched);

  logger.info({ checked, newReleases, cleaned, rescored }, 'GitLab release checker: done');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
