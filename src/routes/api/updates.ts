import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { sql } from 'drizzle-orm';

export async function updatesApiRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      limit?: string;
      min_score?: string;
      category?: string;
      q?: string;
    };
  }>(
    '/api/v1/updates',
    {
      preHandler: [app.verifyHmac],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const {
        limit: limitStr = '50',
        min_score: minScoreStr = '0',
        category = 'all',
        q = '',
      } = request.query;

      const limit = Math.min(Math.max(1, parseInt(limitStr, 10) || 50), 200);
      const minScore = parseFloat(minScoreStr) || 0;

      // Match the dashboard's default update semantics: pinned and actively
      // deferred packages are hidden from the normal CLI/API update queue.
      const activeDefer = sql`(p.deferred_at IS NOT NULL AND (p.defer_days IS NULL OR p.deferred_at + p.defer_days * 86400000 > (unixepoch() * 1000)))`;
      const conditions = category === 'pinned'
        ? [sql`ss.score >= ${minScore}`, sql`p.pinned_at IS NOT NULL`]
        : category === 'deferred'
        ? [sql`ss.score >= ${minScore}`, sql`p.deferred_at IS NOT NULL`]
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
        }
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // Count total outdated
      const [totalResult] = await db.execute(sql`
        SELECT count(*) AS total
        FROM staleness_scores ss
        JOIN packages p ON ss.package_id = p.id
        ${whereClause}
      `);
      const totalOutdated = Number((totalResult as any).total) || 0;

      // Main query (correlated subqueries in place of Postgres LATERAL joins)
      const rows = await db.execute(sql`
        SELECT
          p.name,
          p.version AS installed_version,
          p.groups,
          ss.score AS staleness_score,
          ss.versions_behind,
          ss.days_behind,
          ss.has_cve,
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
        FROM staleness_scores ss
        JOIN packages p ON ss.package_id = p.id
        ${whereClause}
        ORDER BY ss.score DESC
        LIMIT ${limit}
      `);

      const updates = rows.map((row: any) => ({
        name: row.name,
        installed_version: row.installed_version,
        upstream_version: row.upstream_version,
        staleness_score: row.staleness_score,
        versions_behind: row.versions_behind,
        days_behind: row.days_behind,
        open_cves: Number(row.open_cves),
        max_cvss: row.max_cvss,
        reverse_dep_count: Number(row.reverse_dep_count),
        upstream_url: row.upstream_url,
        groups: row.groups ?? [],
      }));

      return reply.status(200).send({
        generated_at: new Date().toISOString(),
        total_outdated: totalOutdated,
        updates,
      });
    },
  );
}

// Re-export pin/unpin endpoints from api for HMAC access
