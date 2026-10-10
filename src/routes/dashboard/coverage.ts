import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { sql, count, eq, desc } from 'drizzle-orm';

export async function coverageDashboardRoutes(app: FastifyInstance) {
  app.get('/coverage', async (_request, reply) => {
    // Total packages
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.packages)
      .where(sql`${schema.packages.removedAt} IS NULL`);

    // Monitored packages (have an upstream source)
    const [monitoredResult] = await db.execute(sql`
      SELECT count(DISTINCT us.package_id) AS count
      FROM upstream_sources us
      JOIN packages p ON us.package_id = p.id
      WHERE p.removed_at IS NULL
    `);

    const total = totalResult.count;
    const monitored = Number((monitoredResult as any).count) || 0;
    const unmonitored = total - monitored;
    const pct = total > 0 ? Math.round((monitored / total) * 100) : 0;

    // Unmonitored packages with details
    const unmatchedPkgs = await db.execute(sql`
      SELECT p.name, p.version, p.install_date, p.groups
      FROM packages p
      WHERE p.removed_at IS NULL
        AND p.id NOT IN (SELECT package_id FROM upstream_sources)
      ORDER BY p.name
    `);

    // Group breakdown
    const groupBreakdown = await db.execute(sql`
      WITH pkg_groups AS (
        SELECT p.id AS id, g.value AS group_name
        FROM packages p, json_each(p.groups) AS g
        WHERE p.removed_at IS NULL
      )
      SELECT
        pg.group_name,
        count(*) AS total,
        count(*) FILTER (WHERE pg.id IN (SELECT package_id FROM upstream_sources)) AS covered
      FROM pkg_groups pg
      GROUP BY pg.group_name
      ORDER BY pg.group_name
    `);

    return reply.view('pages/coverage.ejs', {
      title: 'Upstream Coverage',
      total,
      monitored,
      unmonitored,
      pct,
      unmatchedPkgs: unmatchedPkgs as any[],
      groupBreakdown: (groupBreakdown as any[]).map((r: any) => ({
        group: r.group_name,
        total: Number(r.total),
        covered: Number(r.covered),
        pct: Number(r.total) > 0 ? Math.round((Number(r.covered) / Number(r.total)) * 100) : 0,
      })),
    });
  });
}
