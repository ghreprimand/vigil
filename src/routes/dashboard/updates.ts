import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import ejs from 'ejs';
import { resolve } from 'path';
import { config } from '../../config.js';

const viewsDir = resolve(config.projectRoot, 'src', 'views');

export async function updatesRoutes(app: FastifyInstance) {
  app.get('/updates', async (request, reply) => {
    const {
      q = '',
      sort = 'score',
      dir = 'desc',
      category = 'all',
      min_score: minScore = '0',
      page = '1',
    } = request.query as {
      q?: string;
      sort?: string;
      dir?: string;
      category?: string;
      min_score?: string;
      page?: string;
    };
    const safeDir = dir === 'asc' ? 'asc' : 'desc';

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;
    const { updates, totalOutdated } = await queryUpdates(q, sort, safeDir, category, minScore, currentPage, pageSize);

    // Summary stats
    const [securityResult] = await db.execute(sql`
      SELECT count(*) AS cnt FROM staleness_scores ss
      JOIN packages p ON ss.package_id = p.id
      WHERE has_cve = true AND p.pinned_at IS NULL
    `);
    const securityCount = Number((securityResult as any).cnt) || 0;

    const [highPriorityResult] = await db.execute(sql`
      SELECT count(*) AS cnt FROM staleness_scores ss
      JOIN packages p ON ss.package_id = p.id
      WHERE score >= 20 AND p.pinned_at IS NULL AND p.deferred_at IS NULL
    `);
    const highPriorityCount = Number((highPriorityResult as any).cnt) || 0;

    const [avgResult] = await db.execute(sql`
      SELECT COALESCE(round(avg(ss.score), 1), 0) AS avg_score
      FROM staleness_scores ss
      JOIN packages p ON ss.package_id = p.id
      WHERE p.pinned_at IS NULL AND p.deferred_at IS NULL
    `);
    const avgScore = (avgResult as any).avg_score ?? '0';

    const [pinnedResult] = await db.execute(sql`
      SELECT count(*) AS cnt FROM packages WHERE pinned_at IS NOT NULL
    `);
    const pinnedCount = Number((pinnedResult as any).cnt) || 0;

    const [deferredResult] = await db.execute(sql`
      SELECT count(*) AS cnt FROM packages WHERE deferred_at IS NOT NULL
    `);
    const deferredCount = Number((deferredResult as any).cnt) || 0;

    const totalPages = Math.ceil(totalOutdated / pageSize);

    // JSON export
    const { format } = request.query as { format?: string };
    if (format === 'json') {
      return reply.send({
        totalOutdated,
        page: currentPage,
        pageSize,
        updates,
      });
    }

    return reply.view('pages/updates.ejs', {
      title: 'Updates',
      updates,
      totalOutdated,
      totalPages,
      currentPage,
      securityCount,
      highPriorityCount,
      avgScore,
      pinnedCount,
      deferredCount,
      query: q,
      sort,
      dir: safeDir,
      category,
      minScore,
    });
  });

  app.get('/partials/updates-table', async (request, reply) => {
    const {
      q = '',
      sort = 'score',
      dir = 'desc',
      category = 'all',
      min_score: minScore = '0',
      page = '1',
    } = request.query as {
      q?: string;
      sort?: string;
      dir?: string;
      category?: string;
      min_score?: string;
      page?: string;
    };
    const safeDir = dir === 'asc' ? 'asc' : 'desc';

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 50;
    const { updates, totalOutdated } = await queryUpdates(q, sort, safeDir, category, minScore, currentPage, pageSize);
    const totalPages = Math.ceil(totalOutdated / pageSize);

    const html = await ejs.renderFile(resolve(viewsDir, 'partials', 'updates-table.ejs'), {
      updates,
      totalOutdated,
      totalPages,
      currentPage,
      sort,
      dir: safeDir,
      category,
    });
    return reply.type('text/html').send(html);
  });
}

async function queryUpdates(
  q: string,
  sort: string,
  dir: string,
  category: string,
  minScoreStr: string,
  page: number,
  pageSize: number,
) {
  const minScore = parseFloat(minScoreStr) || 0;
  // "Active deferral" = deferred_at set AND (no expiry OR not yet expired)
  const activeDefer = sql`(p.deferred_at IS NOT NULL AND (p.defer_days IS NULL OR p.deferred_at + p.defer_days * 86400000 > (unixepoch() * 1000)))`;
  // Pinned/deferred packages are shown only in their respective category views
  const conditions = category === 'pinned'
    ? [sql`p.pinned_at IS NOT NULL`]
    : category === 'deferred'
    ? [sql`p.deferred_at IS NOT NULL`]
    : [sql`ss.score >= ${minScore}`, sql`p.pinned_at IS NULL`, sql`(p.deferred_at IS NULL OR NOT ${activeDefer} OR ss.has_cve = true)`];

  if (q) {
    conditions.push(sql`p.name LIKE ${`%${q}%`}`);
  }

  if (category && category !== 'all' && category !== 'pinned' && category !== 'deferred') {
    if (category === 'security') {
      conditions.push(sql`ss.has_cve = true`);
    } else if (category === 'kde') {
      conditions.push(sql`EXISTS (SELECT 1 FROM json_each(p.groups) WHERE value IN ('kde-frameworks', 'kde-plasma', 'kde-gear'))`);
    } else if (category === 'core') {
      conditions.push(sql`EXISTS (SELECT 1 FROM json_each(p.groups) WHERE value IN ('lfs', 'blfs-phase1', 'blfs-phase2'))`);
    } else if (category === 'apps') {
      conditions.push(sql`EXISTS (SELECT 1 FROM json_each(p.groups) WHERE value IN ('blfs-phase7', 'kde-gear'))`);
    } else if (category === 'toolchain') {
      conditions.push(sql`EXISTS (SELECT 1 FROM json_each(p.groups) WHERE value = 'toolchain')`);
    }
  }

  const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const asc = dir !== 'desc';
  const sortClause = sort === 'name'
    ? (asc ? sql`p.name ASC` : sql`p.name DESC`)
    : sort === 'days'
    ? (asc ? sql`ss.days_behind ASC` : sql`ss.days_behind DESC`)
    : sort === 'cves'
    ? (asc ? sql`open_cves ASC NULLS LAST` : sql`open_cves DESC NULLS LAST`)
    : sort === 'revdeps'
    ? (asc ? sql`reverse_dep_count ASC NULLS LAST` : sql`reverse_dep_count DESC NULLS LAST`)
    : sort === 'installed'
    ? (asc ? sql`p.version ASC` : sql`p.version DESC`)
    : sort === 'available'
    ? (asc ? sql`upstream_version ASC NULLS LAST` : sql`upstream_version DESC NULLS LAST`)
    : category === 'deferred'
    ? (asc ? sql`p.deferred_at ASC` : sql`p.deferred_at DESC`)
    : (asc ? sql`ss.score ASC` : sql`ss.score DESC`);

  const offset = (page - 1) * pageSize;

  // For the deferred category, packages may not have staleness scores - query from packages directly
  const fromClause = category === 'deferred'
    ? sql`FROM packages p LEFT JOIN staleness_scores ss ON ss.package_id = p.id`
    : sql`FROM staleness_scores ss JOIN packages p ON ss.package_id = p.id`;

  // Count
  const [countResult] = await db.execute(sql`
    SELECT count(*) AS total
    ${fromClause}
    ${whereClause}
  `);
  const totalOutdated = Number((countResult as any).total) || 0;

  // Main query
  const rows = await db.execute(sql`
    SELECT
      p.name,
      p.version AS installed_version,
      p.groups,
      p.pinned_at,
      p.pin_reason,
      p.deferred_at,
      p.defer_reason,
      p.defer_days,
      COALESCE(ss.score, 0) AS score,
      COALESCE(ss.versions_behind, 0) AS versions_behind,
      COALESCE(ss.days_behind, 0) AS days_behind,
      COALESCE(ss.has_cve, false) AS has_cve,
      ss.max_cvss,
      (SELECT version FROM upstream_releases
         WHERE package_id = p.id AND is_newer = true
         ORDER BY release_date DESC NULLS LAST, ver_key(version) DESC, discovered_at DESC
         LIMIT 1) AS upstream_version,
      (SELECT release_url FROM upstream_releases
         WHERE package_id = p.id AND is_newer = true
         ORDER BY release_date DESC NULLS LAST, ver_key(version) DESC, discovered_at DESC
         LIMIT 1) AS upstream_url,
      (SELECT count(*) FROM package_vulnerabilities pv
         JOIN vulnerabilities v ON pv.vulnerability_id = v.id
         WHERE pv.package_id = p.id AND v.status = 'open') AS open_cves,
      (SELECT count(*) FROM dependency_edges WHERE depends_on_id = p.id) AS reverse_dep_count
    ${fromClause}
    ${whereClause}
    ORDER BY ${sortClause}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const updates = rows.map((row: any) => ({
    name: row.name,
    installedVersion: row.installed_version,
    upstreamVersion: row.upstream_version,
    score: row.score,
    versionsBehind: row.versions_behind,
    daysBehind: row.days_behind,
    hasCve: row.has_cve,
    maxCvss: row.max_cvss,
    openCves: Number(row.open_cves),
    reverseDepCount: Number(row.reverse_dep_count),
    upstreamUrl: row.upstream_url,
    groups: row.groups ?? [],
    pinnedAt: row.pinned_at ?? null,
    pinReason: row.pin_reason ?? null,
    deferredAt: row.deferred_at ?? null,
    deferReason: row.defer_reason ?? null,
    deferDays: row.defer_days != null ? Number(row.defer_days) : null,
  }));

  return { updates, totalOutdated };
}
