import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { config as appConfig, brand } from '../../config.js';
import { isPreRelease } from '../../workers/lib/version-filter.js';
import { triggerWorker } from '../../workers/index.js';
import { isNewer } from '../../services/version-compare.js';
import { recalculateStaleness } from '../../services/staleness.js';

const SOURCE_TO_WORKER: Record<string, string> = {
  github: 'github-release',
  gitlab: 'gitlab-release',
  gnu: 'gnu-release',
  kde: 'kde-release',
  pypi: 'pypi-release',
  generic: 'generic-release',
  kernel: 'kernel-release',
  qt: 'github-release',
};

interface SourceFormBody {
  source_type: string;
  owner?: string;
  repo?: string;
  tag_prefix?: string;
  tag_pattern?: string;
  asset_pattern?: string;
  host?: string;
  project_path?: string;
  package?: string;   // gnu, pypi; also kde (mapped to component)
  url?: string;
  pattern?: string;
}

export async function sourceManagementRoutes(app: FastifyInstance) {
  // Save/upsert upstream source
  app.post<{ Params: { name: string }; Body: SourceFormBody }>(
    '/packages/:name/source',
    async (request, reply) => {
      const { name } = request.params;
      const body = request.body;

      const [pkg] = await db
        .select({ id: schema.packages.id })
        .from(schema.packages)
        .where(eq(schema.packages.name, name))
        .limit(1);

      if (!pkg) {
        reply.header('Content-Type', 'text/html');
        return reply.status(404).send(errorHtml('Package not found'));
      }

      if (!body.source_type) {
        reply.header('Content-Type', 'text/html');
        return reply.status(400).send(errorHtml('Source type is required'));
      }

      const sourceConfig = buildConfig(body);

      const [existing] = await db
        .select({ id: schema.upstreamSources.id })
        .from(schema.upstreamSources)
        .where(eq(schema.upstreamSources.packageId, pkg.id))
        .limit(1);

      if (existing) {
        await db
          .update(schema.upstreamSources)
          .set({ sourceType: body.source_type, config: sourceConfig, lastChecked: null, enabled: true })
          .where(eq(schema.upstreamSources.id, existing.id));
      } else {
        await db.insert(schema.upstreamSources).values({
          packageId: pkg.id,
          sourceType: body.source_type,
          config: sourceConfig,
          enabled: true,
        });
      }

      reply.header('HX-Redirect', `/packages/${encodeURIComponent(name)}?saved=1`);
      return reply.status(200).send('');
    },
  );

  // Remove upstream source
  app.post<{ Params: { name: string } }>(
    '/packages/:name/source/remove',
    async (request, reply) => {
      const { name } = request.params;

      const [pkg] = await db
        .select({ id: schema.packages.id })
        .from(schema.packages)
        .where(eq(schema.packages.name, name))
        .limit(1);

      if (pkg) {
        await db
          .delete(schema.upstreamSources)
          .where(eq(schema.upstreamSources.packageId, pkg.id));
      }

      reply.header('HX-Redirect', `/packages/${encodeURIComponent(name)}`);
      return reply.status(200).send('');
    },
  );

  // Immediately check this package's upstream source and upsert results
  app.post<{ Params: { name: string } }>(
    '/packages/:name/source/check-now',
    async (request, reply) => {
      reply.header('Content-Type', 'text/html');
      const { name } = request.params;

      const [pkg] = await db
        .select({ id: schema.packages.id, version: schema.packages.version })
        .from(schema.packages)
        .where(eq(schema.packages.name, name))
        .limit(1);

      if (!pkg) return reply.status(404).send(errorHtml('Package not found'));

      const [src] = await db
        .select({
          id: schema.upstreamSources.id,
          sourceType: schema.upstreamSources.sourceType,
          config: schema.upstreamSources.config,
        })
        .from(schema.upstreamSources)
        .where(eq(schema.upstreamSources.packageId, pkg.id))
        .limit(1);

      if (!src) return reply.status(404).send(errorHtml('No upstream source configured'));

      // For GitHub: check immediately and upsert results - no worker queue needed
      if (src.sourceType === 'github') {
        try {
          const cfg = src.config as any;
          const releases = await fetchGithubReleasesRaw(
            cfg.owner || '',
            cfg.repo || '',
            cfg.tag_prefix || '',
            cfg.tag_pattern || '',
            cfg.asset_pattern || '',
          );

          for (const rel of releases.slice(0, 10)) {
            const newer = isNewer(rel.version, pkg.version);
            await db
              .insert(schema.upstreamReleases)
              .values({
                packageId: pkg.id,
                sourceId: src.id,
                version: rel.version,
                releaseDate: rel.publishedAt ? new Date(rel.publishedAt) : null,
                releaseUrl: rel.url || null,
                isNewer: newer,
              })
              .onConflictDoUpdate({
                target: [
                  schema.upstreamReleases.packageId,
                  schema.upstreamReleases.sourceId,
                  schema.upstreamReleases.version,
                ],
                set: { releaseUrl: rel.url || null, isNewer: newer },
              });
          }

          await db
            .update(schema.upstreamSources)
            .set({ lastChecked: new Date() })
            .where(eq(schema.upstreamSources.id, src.id));

          // Recompute staleness now that is_newer flags may have changed,
          // so the Updates page and Overview "Outdated" count stay in sync.
          await recalculateStaleness([name]).catch(() => {});

          // Redirect immediately - page will show fresh lastChecked + releases
          reply.header('HX-Redirect', `/packages/${encodeURIComponent(name)}`);
          return reply.status(200).send('');
        } catch (err: any) {
          return reply.send(errorHtml(`GitHub check failed: ${escHtml(err.message)}`));
        }
      }

      // For non-GitHub: queue the worker (these are harder to check inline)
      const workerName = SOURCE_TO_WORKER[src.sourceType];
      if (workerName) {
        await triggerWorker(workerName);
      }
      return reply.send(
        `<span class="text-secondary">OK Worker queued - refreshing in 30s...</span>`,
      );
    },
  );

  // Test upstream source - preview matching releases without saving
  app.post<{ Params: { name: string }; Body: SourceFormBody }>(
    '/packages/:name/source/test',
    async (request, reply) => {
      const body = request.body;
      reply.header('Content-Type', 'text/html');

      if (body.source_type !== 'github') {
        return reply.send(
          `<div class="source-test-result source-test-ok">
            <strong>${escHtml(body.source_type)}</strong> source configured -
            the worker will fetch releases on the next scheduled cycle.
            Click <em>Save Source</em> to activate monitoring.
          </div>`,
        );
      }

      const owner = str(body.owner);
      const repo = str(body.repo);
      if (!owner || !repo) {
        return reply.send(errorHtml('Owner and Repo are required for GitHub sources.'));
      }

      try {
        const releases = await testGithubSource(
          owner,
          repo,
          str(body.tag_prefix) || '',
          str(body.tag_pattern) || '',
        );

        if (releases.length === 0) {
          return reply.send(
            errorHtml(
              'No matching releases found. Check the owner/repo spelling and tag pattern - ' +
              'if the repo uses tags instead of releases, those are checked automatically.',
            ),
          );
        }

        const rows = releases
          .slice(0, 5)
          .map(
            (r) =>
              `<tr>
                <td class="mono">${escHtml(r.version)}</td>
                <td class="text-secondary">${r.date ? escHtml(r.date) : '&mdash;'}</td>
                <td>${r.url ? `<a href="${escHtml(r.url)}" target="_blank" rel="noopener">-></a>` : '&mdash;'}</td>
              </tr>`,
          )
          .join('');

        return reply.send(
          `<div class="source-test-result source-test-ok">
            <div class="source-test-header">
              OK Found ${releases.length} matching release${releases.length !== 1 ? 's' : ''} - showing first 5
            </div>
            <table class="data-table" style="margin-top: 0.5rem; border: none; font-size: 0.82rem;">
              <thead><tr><th>Version</th><th>Date</th><th>Link</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`,
        );
      } catch (err: any) {
        return reply.send(errorHtml(`GitHub API error: ${escHtml(err.message)}`));
      }
    },
  );
}

// -- Helpers ----------------------------------------------------------------

/** Coerce a potentially-array form value to a trimmed string or undefined. */
function str(v: unknown): string | undefined {
  const s = Array.isArray(v) ? (v as unknown[])[0] : v;
  return typeof s === 'string' ? s.trim() || undefined : undefined;
}

function buildConfig(body: SourceFormBody): Record<string, unknown> {
  const trim = (v: unknown) => str(v);
  switch (body.source_type) {
    case 'github':
      return {
        owner: trim(body.owner),
        repo: trim(body.repo),
        ...(trim(body.tag_prefix) && { tag_prefix: trim(body.tag_prefix) }),
        ...(trim(body.tag_pattern) && { tag_pattern: trim(body.tag_pattern) }),
        ...(trim(body.asset_pattern) && { asset_pattern: trim(body.asset_pattern) }),
      };
    case 'gitlab':
      return {
        host: trim(body.host) || 'gitlab.com',
        project_path: trim(body.project_path),
        ...(trim(body.tag_prefix) && { tag_prefix: trim(body.tag_prefix) }),
        ...(trim(body.tag_pattern) && { tag_pattern: trim(body.tag_pattern) }),
      };
    case 'kde':
      return { component: trim(body.package) };
    case 'gnu':
    case 'pypi':
      return { package: trim(body.package) };
    case 'generic':
      return {
        url: trim(body.url),
        ...(trim(body.pattern) && { pattern: trim(body.pattern) }),
      };
    default:
      return {};
  }
}

// Shared GitHub fetch+parse - returns raw data suitable for both preview and DB upsert
async function fetchGithubReleasesRaw(
  owner: string,
  repo: string,
  tagPrefix: string,
  tagPattern: string,
  assetPattern: string = '',
): Promise<{ version: string; publishedAt: string | null; url: string }[]> {
  if (!owner || !repo) throw new Error('Owner and repo are required');

  const GITHUB_API = 'https://api.github.com';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': brand.userAgent,
  };
  if (appConfig.github.token) {
    headers.Authorization = `Bearer ${appConfig.github.token}`;
  }

  const url = `${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=30`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) throw new Error(`Repository "${owner}/${repo}" not found on GitHub`);
    throw new Error(`GitHub API returned ${response.status} ${response.statusText}`);
  }

  let releases: any[] = await response.json();

  // Empty releases -> fall back to tags
  if (!Array.isArray(releases) || releases.length === 0) {
    const tagsUrl = `${GITHUB_API}/repos/${owner}/${repo}/tags?per_page=30`;
    const tagsResp = await fetch(tagsUrl, { headers });
    if (tagsResp.ok) {
      const tags = await tagsResp.json();
      releases = (tags as any[]).map((t) => ({
        tag_name: t.name,
        name: t.name,
        prerelease: false,
        published_at: null,
        html_url: `https://github.com/${owner}/${repo}/releases/tag/${t.name}`,
      }));
    }
  }

  const patternRe = tagPattern ? new RegExp(tagPattern) : null;
  const assetRe = assetPattern ? new RegExp(assetPattern) : null;
  const results: { version: string; publishedAt: string | null; url: string }[] = [];

  for (const rel of releases) {
    if (rel.prerelease) continue;

    let version: string = rel.tag_name || rel.name || '';
    if (!version) continue;

    // When asset_pattern is configured, extract version from asset filenames
    if (assetRe) {
      let found = false;
      if (rel.assets?.length) {
        for (const asset of rel.assets) {
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
      if (tagPrefix && version.startsWith(tagPrefix)) version = version.slice(tagPrefix.length);

      if (patternRe) {
        const m = version.match(patternRe);
        if (m && m[1]) version = m[1];
        else continue;
      }

      if (version.startsWith('v')) version = version.slice(1);
    }

    if (!version) continue;
    if (isPreRelease(version)) continue;

    results.push({ version, publishedAt: rel.published_at || null, url: rel.html_url || '' });
  }

  return results;
}

// Format raw results for the Test Source preview UI
async function testGithubSource(
  owner: string,
  repo: string,
  tagPrefix: string,
  tagPattern: string,
): Promise<{ version: string; date: string; url: string }[]> {
  const raw = await fetchGithubReleasesRaw(owner, repo, tagPrefix, tagPattern);
  return raw.map((r) => ({
    version: r.version,
    date: r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : '',
    url: r.url,
  }));
}

function errorHtml(msg: string): string {
  return `<div class="source-test-result source-test-error">${escHtml(msg)}</div>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
