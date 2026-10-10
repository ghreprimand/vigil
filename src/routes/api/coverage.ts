import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { sql } from 'drizzle-orm';

export async function coverageRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/coverage',
    {
      preHandler: [app.verifyHmac],
    },
    async (_request, reply) => {
      // Count total active packages
      const [totalResult] = await db.execute(sql`
        SELECT count(*) AS total FROM packages WHERE removed_at IS NULL
      `);
      const totalPackages = Number((totalResult as any).total) || 0;

      // Count packages that have at least one upstream source
      const [coveredResult] = await db.execute(sql`
        SELECT count(DISTINCT us.package_id) AS covered
        FROM upstream_sources us
        JOIN packages p ON us.package_id = p.id
        WHERE p.removed_at IS NULL
      `);
      const coveredPackages = Number((coveredResult as any).covered) || 0;

      // Get unmapped packages (no upstream source)
      const unmapped = await db.execute(sql`
        SELECT p.name, p.version, p.groups
        FROM packages p
        WHERE p.removed_at IS NULL
          AND p.id NOT IN (SELECT DISTINCT package_id FROM upstream_sources)
        ORDER BY p.name
      `);

      const coveragePercent = totalPackages > 0
        ? Math.round((coveredPackages / totalPackages) * 1000) / 10
        : 0;

      return reply.send({
        total_packages: totalPackages,
        covered_packages: coveredPackages,
        coverage_percent: coveragePercent,
        unmapped: unmapped.map((row: any) => ({
          name: row.name,
          version: row.version,
          groups: row.groups ?? [],
        })),
      });
    },
  );
}
