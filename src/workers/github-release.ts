import { db, schema } from '../db/index.js';
import { eq, and, inArray, not } from 'drizzle-orm';
import { config, brand } from '../config.js';
import { isNewer } from '../services/version-compare.js';
import { logger } from '../utils/logger.js';
import { isPreRelease, isUnstableBranch } from './lib/version-filter.js';
import { runPostReleaseTasks } from './lib/post-release-tasks.js';

const GITHUB_API = 'https://api.github.com';

// In-memory ETag cache; only the ETag string is persisted to the DB to avoid
// storing multi-MB GitHub API responses in the settings table.  On restart the
// in-memory data is empty, so the first request per URL will be a full fetch
// instead of a conditional 304 - a single extra API call that costs nothing.
const etagCache = new Map<string, { etag: string; data: any }>();

async function loadEtag(url: string): Promise<{ etag: string; data: any } | null> {
  const cached = etagCache.get(url);
  if (cached) return cached;

  // Fall back to DB - only the ETag string is stored
  const key = `etag:github:${url}`;
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  if (row?.value) {
    // Handle legacy rows that stored { etag, data } as well as new rows that
    // store just the ETag string.
    const raw = row.value as any;
    const etag = typeof raw === 'string' ? raw : raw.etag;
    if (etag) {
      // No cached data available from DB - caller must do a full fetch
      return { etag, data: null };
    }
  }
  return null;
}

async function saveEtag(url: string, etag: string, data: any): Promise<void> {
  // Keep full response in memory for 304 handling during this process lifetime
  etagCache.set(url, { etag, data });

  // Persist only the ETag string to the DB (not the multi-MB response body)
  const key = `etag:github:${url}`;
  await db
    .insert(schema.settings)
    .values({ key, value: etag as unknown, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: etag as unknown, updatedAt: new Date() },
    });
}

interface GithubSourceConfig {
  owner: string;
  repo: string;
  tag_prefix?: string;
  tag_pattern?: string;
  asset_pattern?: string; // Regex with capture group to extract version from asset filename
}

export async function processGithubRelease(): Promise<void> {
  // Find all enabled GitHub upstream sources
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
        eq(schema.upstreamSources.sourceType, 'github'),
        eq(schema.upstreamSources.enabled, true),
      ),
    );

  logger.info({ count: sources.length }, 'GitHub release checker: processing sources');

  let checked = 0;
  let newReleases = 0;
  let stalePruned = 0;
  const touched = new Set<string>();

  for (const source of sources) {
    try {
      const cfg = source.config as unknown as GithubSourceConfig;
      if (!cfg.owner || !cfg.repo) {
        logger.warn({ sourceId: source.sourceId, packageName: source.packageName }, 'GitHub source missing owner/repo');
        continue;
      }

      const releases = await fetchGithubReleases(cfg.owner, cfg.repo);
      if (!releases) {
        // 304 Not Modified or error
        checked++;
        continue;
      }

      let matched = 0;
      const seenVersions = new Set<string>();
      for (const release of releases) {
        if (matched >= 10) break;
        // Skip GitHub-flagged pre-releases
        if (release.prerelease) continue;

        const tagName: string = release.tag_name || release.name || '';
        if (!tagName) continue;

        let version = tagName;

        // When asset_pattern is configured, extract version from asset filenames
        // instead of the tag name. Skip releases with no matching asset.
        if (cfg.asset_pattern) {
          let found = false;
          if (release.assets?.length) {
            const assetRe = new RegExp(cfg.asset_pattern);
            for (const asset of release.assets) {
              const m = asset.name?.match(assetRe);
              if (m && m[1]) {
                version = m[1];
                found = true;
                break;
              }
            }
          }
          if (!found) continue;
        } else {
          // Strip tag prefix
          if (cfg.tag_prefix && version.startsWith(cfg.tag_prefix)) {
            version = version.slice(cfg.tag_prefix.length);
          }

          // Apply tag pattern regex
          if (cfg.tag_pattern) {
            const match = version.match(new RegExp(cfg.tag_pattern));
            if (match && match[1]) {
              version = match[1];
            } else {
              continue; // Skip non-matching tags
            }
          }

          // Strip leading 'v' if present
          if (version.startsWith('v')) {
            version = version.slice(1);
          }

          // Normalize underscores to dots (e.g., curl tags: 8_19_0 -> 8.19.0)
          version = version.replace(/_/g, '.');

          // If the extracted version doesn't start with a digit but the release
          // name does, prefer the release name (e.g., curl: tag "curl-8_19_0",
          // name "8.19.0")
          if (!/^\d/.test(version) && release.name && /^\d/.test(release.name)) {
            version = release.name.trim();
            if (version.startsWith('v')) version = version.slice(1);
          }
        }

        if (!version) continue;

        // Skip pre-release versions
        if (isPreRelease(version)) continue;

        // Skip GNOME/Perl/Python unstable branches
        if (isUnstableBranch(source.packageName, version, source.packageVersion)) continue;

        // Skip anything that doesn't look like a version number (e.g. CVE-named tags)
        if (!/^\d/.test(version)) continue;

        const newer = isNewer(version, source.packageVersion);
        seenVersions.add(version);

        // Upsert release
        await db
          .insert(schema.upstreamReleases)
          .values({
            packageId: source.packageId,
            sourceId: source.sourceId,
            version,
            releaseDate: release.published_at ? new Date(release.published_at) : null,
            releaseNotes: release.body?.slice(0, 2000) || null,
            releaseUrl: release.html_url || null,
            isNewer: newer,
          })
          .onConflictDoUpdate({
            target: [
              schema.upstreamReleases.packageId,
              schema.upstreamReleases.sourceId,
              schema.upstreamReleases.version,
            ],
            set: {
              releaseDate: release.published_at ? new Date(release.published_at) : null,
              releaseUrl: release.html_url || null,
              isNewer: newer,
            },
          });

        if (newer) newReleases++;
        touched.add(source.packageName);
        matched++;
      }

      if (seenVersions.size > 0) {
        const result = await db
          .update(schema.upstreamReleases)
          .set({ isNewer: false })
          .where(
            and(
              eq(schema.upstreamReleases.sourceId, source.sourceId),
              eq(schema.upstreamReleases.isNewer, true),
              not(inArray(schema.upstreamReleases.version, [...seenVersions])),
            ),
          );
        const changed = (result as unknown as { changes?: number }).changes ?? 0;
        if (changed > 0) {
          stalePruned += changed;
          touched.add(source.packageName);
        }
      }

      // Update last_checked
      await db
        .update(schema.upstreamSources)
        .set({ lastChecked: new Date() })
        .where(eq(schema.upstreamSources.id, source.sourceId));

      checked++;

      // Rate limit: pause between API calls
      await sleep(500);
    } catch (err) {
      logger.error({ err, sourceId: source.sourceId, packageName: source.packageName }, 'GitHub release check failed');
    }
  }

  // Retroactive cleanup + incremental staleness recompute for touched packages
  const { cleaned, rescored } = await runPostReleaseTasks('github', touched);

  logger.info({ checked, newReleases, stalePruned, cleaned, rescored }, 'GitHub release checker: done');
}

async function fetchGithubReleases(owner: string, repo: string): Promise<any[] | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=30`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': brand.userAgent,
  };

  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }

  // ETag caching (memory + DB persistence)
  const cached = await loadEtag(url);
  if (cached) {
    headers['If-None-Match'] = cached.etag;
  }

  let response = await fetch(url, { headers });

  if (response.status === 304) {
    if (cached?.data) return cached.data;

    delete headers['If-None-Match'];
    response = await fetch(url, { headers });
  }

  if (response.status === 404) {
    // Try tags endpoint as fallback
    return fetchGithubTags(owner, repo);
  }

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const resetAt = response.headers.get('x-ratelimit-reset');
      logger.warn({ owner, repo, resetAt }, 'GitHub rate limit hit');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // If releases endpoint returns empty array or all releases are prereleases,
  // fall back to tags (e.g., ghostty only has a "tip" prerelease)
  if (Array.isArray(data)) {
    if (data.length === 0 || data.every((r: any) => r.prerelease)) {
      return fetchGithubTags(owner, repo);
    }
  }

  const etag = response.headers.get('etag');
  if (etag) {
    await saveEtag(url, etag, data);
  }

  return data;
}

async function fetchGithubTags(owner: string, repo: string): Promise<any[] | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/tags?per_page=30`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': brand.userAgent,
  };

  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) return null;

  const tags = await response.json();
  // Convert tags to release-like objects
  return tags.map((tag: any) => ({
    tag_name: tag.name,
    name: tag.name,
    published_at: null,
    body: null,
    html_url: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
