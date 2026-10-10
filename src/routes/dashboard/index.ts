import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { count, desc, ilike, sql } from 'drizzle-orm';
import ejs from 'ejs';
import { resolve } from 'path';
import { config } from '../../config.js';

const viewsDir = resolve(config.projectRoot, 'src', 'views');

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    return reply.redirect('/overview');
  });

  app.get('/packages', async (request, reply) => {
    const { q = '', sort = 'name', dir = 'asc', group = '', status = '', page = '1' } = request.query as {
      q?: string;
      sort?: string;
      dir?: string;
      group?: string;
      status?: string;
      page?: string;
    };
    const safeDir = dir === 'desc' ? 'desc' : 'asc';

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 100;
    const { packages, totalFiltered } = await queryPackagesWithUpstream(q, sort, safeDir, group, status, currentPage, pageSize);

    const [pkgCount] = await db.select({ count: count() }).from(schema.packages);
    const [lastPush] = await db
      .select()
      .from(schema.manifestPushes)
      .orderBy(desc(schema.manifestPushes.pushedAt))
      .limit(1);

    const groups = await getDistinctGroups();

    const [outdatedCount] = await db.execute(sql`
      SELECT count(DISTINCT ur.package_id) AS count
      FROM upstream_releases ur
      WHERE ur.is_newer = true
        AND ur.package_id NOT IN (
          SELECT id FROM packages WHERE pinned_at IS NOT NULL OR deferred_at IS NOT NULL OR removed_at IS NOT NULL
        )
    `);

    const [openCveCount] = await db
      .select({ count: count() })
      .from(schema.vulnerabilities)
      .where(sql`${schema.vulnerabilities.status} = 'open' AND EXISTS (SELECT 1 FROM package_vulnerabilities pv WHERE pv.vulnerability_id = ${schema.vulnerabilities.id})`);

    const [deferredCount] = await db.execute(sql`
      SELECT count(*) AS count FROM packages WHERE deferred_at IS NOT NULL
    `);

    const [tierBreakdown] = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE score >= 25) AS critical,
        count(*) FILTER (WHERE score >= 15 AND score < 25) AS high,
        count(*) FILTER (WHERE score >= 5 AND score < 15) AS medium,
        count(*) FILTER (WHERE score > 0 AND score < 5) AS low
      FROM staleness_scores ss
      JOIN packages p ON ss.package_id = p.id
      WHERE p.deferred_at IS NULL AND p.pinned_at IS NULL AND p.removed_at IS NULL
    `);
    const stalenessTiers = {
      critical: Number((tierBreakdown as any).critical) || 0,
      high: Number((tierBreakdown as any).high) || 0,
      medium: Number((tierBreakdown as any).medium) || 0,
      low: Number((tierBreakdown as any).low) || 0,
    };

    const totalPages = Math.ceil(totalFiltered / pageSize);

    return reply.view('pages/dashboard.ejs', {
      title: 'Packages',
      packages,
      packageCount: pkgCount.count,
      totalFiltered,
      totalPages,
      currentPage,
      outdatedCount: Number((outdatedCount as any).count) || 0,
      deferredCount: Number((deferredCount as any).count) || 0,
      stalenessTiers,
      openCveCount: openCveCount.count,
      lastPush: lastPush ?? null,
      query: q,
      sort,
      dir: safeDir,
      group,
      status,
      groups,
    });
  });

  app.get('/partials/package-table', async (request, reply) => {
    const { q = '', sort = 'name', dir = 'asc', group = '', status = '', page = '1' } = request.query as {
      q?: string;
      sort?: string;
      dir?: string;
      group?: string;
      status?: string;
      page?: string;
    };
    const safeDir = dir === 'desc' ? 'desc' : 'asc';

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 100;
    const { packages, totalFiltered } = await queryPackagesWithUpstream(q, sort, safeDir, group, status, currentPage, pageSize);
    const totalPages = Math.ceil(totalFiltered / pageSize);

    const html = await ejs.renderFile(resolve(viewsDir, 'partials', 'package-table.ejs'), {
      packages,
      totalFiltered,
      totalPages,
      currentPage,
      sort,
      dir: safeDir,
    });
    return reply.type('text/html').send(html);
  });
}

async function queryPackagesWithUpstream(q: string, sort: string, dir: string, group: string, status: string = '', page: number = 1, pageSize: number = 100) {
  // Build WHERE conditions using Drizzle sql template for safe parameter binding
  const conditions = [];

  if (q) {
    conditions.push(sql`p.name LIKE ${`%${q}%`}`);
  }
  if (group) {
    conditions.push(sql`EXISTS (SELECT 1 FROM json_each(p.groups) WHERE value = ${group})`);
  }
  if (status === 'outdated') {
    conditions.push(sql`p.id IN (SELECT DISTINCT package_id FROM upstream_releases WHERE is_newer = true)`);
    conditions.push(sql`p.deferred_at IS NULL`);
  } else if (status === 'deferred') {
    conditions.push(sql`p.deferred_at IS NOT NULL`);
  } else if (status === 'critical') {
    conditions.push(sql`p.id IN (SELECT package_id FROM staleness_scores WHERE score >= 25)`);
    conditions.push(sql`p.deferred_at IS NULL`);
    conditions.push(sql`p.pinned_at IS NULL`);
  } else if (status === 'high') {
    conditions.push(sql`p.id IN (SELECT package_id FROM staleness_scores WHERE score >= 15 AND score < 25)`);
    conditions.push(sql`p.deferred_at IS NULL`);
    conditions.push(sql`p.pinned_at IS NULL`);
  } else if (status === 'medium') {
    conditions.push(sql`p.id IN (SELECT package_id FROM staleness_scores WHERE score >= 5 AND score < 15)`);
    conditions.push(sql`p.deferred_at IS NULL`);
    conditions.push(sql`p.pinned_at IS NULL`);
  } else if (status === 'low') {
    conditions.push(sql`p.id IN (SELECT package_id FROM staleness_scores WHERE score > 0 AND score < 5)`);
    conditions.push(sql`p.deferred_at IS NULL`);
    conditions.push(sql`p.pinned_at IS NULL`);
  } else if (status === 'cve') {
    conditions.push(sql`p.id IN (SELECT DISTINCT pv.package_id FROM package_vulnerabilities pv JOIN vulnerabilities v ON pv.vulnerability_id = v.id WHERE v.status = 'open')`);
  } else if (status === 'uptodate') {
    conditions.push(sql`p.id IN (SELECT DISTINCT package_id FROM upstream_releases) AND p.id NOT IN (SELECT DISTINCT package_id FROM upstream_releases WHERE is_newer = true)`);
  } else if (status === 'removed') {
    conditions.push(sql`p.removed_at IS NOT NULL`);
  } else if (status === 'unchecked') {
    // No upstream source configured OR source exists but has never discovered any releases
    // Exclude deferred/pinned/removed packages (they have their own filters)
    conditions.push(sql`p.deferred_at IS NULL AND p.pinned_at IS NULL AND p.removed_at IS NULL`);
    conditions.push(sql`(
      p.id NOT IN (SELECT DISTINCT package_id FROM upstream_sources)
      OR (
        p.id IN (SELECT DISTINCT package_id FROM upstream_sources WHERE enabled = true)
        AND p.id NOT IN (SELECT DISTINCT package_id FROM upstream_releases)
      )
    )`);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const asc = dir !== 'desc';
  const sortClause = sort === 'last_seen'
    ? (asc ? sql`p.last_seen ASC NULLS LAST` : sql`p.last_seen DESC NULLS LAST`)
    : sort === 'install_date'
    ? (asc ? sql`p.install_date ASC NULLS LAST` : sql`p.install_date DESC NULLS LAST`)
    : sort === 'version'
    ? (asc ? sql`p.version ASC` : sql`p.version DESC`)
    : sort === 'upstream'
    ? (asc ? sql`is_newer ASC NULLS LAST, p.name` : sql`is_newer DESC NULLS LAST, p.name`)
    : sort === 'status'
    ? (asc
        ? sql`(CASE WHEN is_newer = true AND open_cve_count > 0 THEN 0 WHEN is_newer = true THEN 1 WHEN upstream_version IS NOT NULL THEN 2 ELSE 3 END) ASC`
        : sql`(CASE WHEN is_newer = true AND open_cve_count > 0 THEN 0 WHEN is_newer = true THEN 1 WHEN upstream_version IS NOT NULL THEN 2 ELSE 3 END) DESC`)
    : (asc ? sql`p.name ASC` : sql`p.name DESC`);

  const offset = (page - 1) * pageSize;

  // Count query for pagination
  const [countResult] = await db.execute(sql`
    SELECT count(*) AS total FROM packages p ${whereClause}
  `);
  const totalFiltered = Number((countResult as any).total) || 0;

  const rows = await db.execute(sql`
    SELECT
      p.*,
      (SELECT version FROM upstream_releases WHERE package_id = p.id
         ORDER BY is_newer DESC, release_date DESC NULLS LAST, id DESC LIMIT 1) AS upstream_version,
      (SELECT is_newer FROM upstream_releases WHERE package_id = p.id
         ORDER BY is_newer DESC, release_date DESC NULLS LAST, id DESC LIMIT 1) AS is_newer,
      (SELECT release_date FROM upstream_releases WHERE package_id = p.id
         ORDER BY is_newer DESC, release_date DESC NULLS LAST, id DESC LIMIT 1) AS upstream_release_date,
      (SELECT count(*) FROM package_vulnerabilities pv
         JOIN vulnerabilities v ON pv.vulnerability_id = v.id
         WHERE pv.package_id = p.id AND v.status = 'open') AS open_cve_count,
      (SELECT count(*) FROM advisory_packages ap
         JOIN advisories a ON ap.advisory_id = a.id
         WHERE ap.package_id = p.id AND a.resolved_at IS NULL) AS active_advisory_count
    FROM packages p
    ${whereClause}
    ORDER BY ${sortClause}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const packages = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    architecture: row.architecture,
    depends: row.depends,
    provides: row.provides,
    groups: row.groups,
    buildDate: row.build_date,
    installDate: row.install_date,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    removedAt: row.removed_at,
    watchedAt: row.watched_at,
    pinnedAt: row.pinned_at,
    deferredAt: row.deferred_at,
    metadata: row.metadata,
    upstream: row.upstream_version
      ? { upstreamVersion: row.upstream_version, isNewer: row.is_newer, releaseDate: row.upstream_release_date }
      : null,
    openCveCount: Number(row.open_cve_count) || 0,
    activeAdvisoryCount: Number(row.active_advisory_count) || 0,
  }));

  return { packages, totalFiltered };
}

async function getDistinctGroups(): Promise<string[]> {
  const rows = await db.execute(
    sql`SELECT DISTINCT je.value AS grp FROM packages, json_each(packages.groups) je WHERE json_array_length(packages.groups) > 0 ORDER BY grp`,
  );
  return rows.map((r: any) => r.grp);
}
