import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { count, desc, sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

export async function statusRoutes(app: FastifyInstance) {
  app.get('/api/v1/status', async (_request, reply) => {
    const [pkgCount] = await db.select({ count: count() }).from(schema.packages);
    const [lastPush] = await db
      .select()
      .from(schema.manifestPushes)
      .orderBy(desc(schema.manifestPushes.pushedAt))
      .limit(1);

    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      packages: pkgCount.count,
      lastManifestPush: lastPush?.pushedAt ?? null,
    });
  });

  app.get('/api/v1/health', async (_request, reply) => {
    const checks: Record<string, boolean> = {
      database: false,
    };

    // Check the SQLite database
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch (err) {
      logger.error({ err }, 'Health check: database unreachable');
    }

    const healthy = checks.database;
    const statusCode = healthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      uptime: Math.floor(process.uptime()),
      version: '2.0.0',
    });
  });
}
