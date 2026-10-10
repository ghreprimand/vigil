import { recalculateAllStaleness } from '../services/staleness.js';
import { sendWatchedPackageAlerts, sendDeferExpiredNotification } from '../services/notifications.js';
import { db, schema } from '../db/index.js';
import { sql, eq, count } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

export async function processStalenessScorer(): Promise<void> {
  logger.info('Starting staleness score recalculation');
  const scored = await recalculateAllStaleness();
  logger.info({ scored }, 'Staleness scoring complete');

  // Auto-clear expired deferrals and notify
  try {
    const expired = await db.execute(sql`
      SELECT name FROM packages
      WHERE deferred_at IS NOT NULL
        AND defer_days IS NOT NULL
        AND deferred_at + defer_days * 86400000 <= (unixepoch() * 1000)
    `);
    if (expired.length > 0) {
      const names = (expired as any[]).map((r) => r.name as string);
      await db.execute(sql`
        UPDATE packages
        SET deferred_at = NULL, defer_reason = NULL, defer_days = NULL
        WHERE deferred_at IS NOT NULL
          AND defer_days IS NOT NULL
          AND deferred_at + defer_days * 86400000 <= (unixepoch() * 1000)
      `);
      logger.info({ count: names.length, packages: names }, 'Auto-cleared expired deferrals');
      await sendDeferExpiredNotification(names);
    }
  } catch (err) {
    logger.error({ err }, 'Auto-clear expired deferrals failed');
  }

  try {
    await sendWatchedPackageAlerts();
  } catch (err) {
    logger.error({ err }, 'Watched package alerts failed');
  }

  // Record daily staleness snapshot (once per day)
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Check if we already have today's snapshot
    const [existing] = await db
      .select({ id: schema.stalenessHistory.id })
      .from(schema.stalenessHistory)
      .where(eq(schema.stalenessHistory.snapshotDate, today))
      .limit(1);

    if (!existing) {
      const [totalPkgs] = await db.select({ count: count() }).from(schema.packages);
      const [outdated] = await db.select({ count: count() }).from(schema.stalenessScores);
      const [openCves] = await db
        .select({ count: count() })
        .from(schema.vulnerabilities)
        .where(eq(schema.vulnerabilities.status, 'open'));

      const statsRows = await db.execute(sql`
        SELECT COALESCE(AVG(score), 0) AS avg_score, COALESCE(MAX(score), 0) AS max_score
        FROM staleness_scores
      `);
      const stats = (statsRows as any[])[0] ?? { avg_score: 0, max_score: 0 };

      await db.insert(schema.stalenessHistory).values({
        snapshotDate: today,
        totalPackages: totalPkgs.count,
        packagesOutdated: outdated.count,
        avgScore: Number(stats.avg_score),
        maxScore: Number(stats.max_score),
        openCves: openCves.count,
      });

      logger.info({ date: today, outdated: outdated.count, avgScore: Number(stats.avg_score).toFixed(1) }, 'Staleness history snapshot recorded');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to record staleness history snapshot');
  }
}
