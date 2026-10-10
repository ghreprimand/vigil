import { db, schema } from '../db/index.js';
import { sql, and, lt, isNotNull } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { cleanupExpiredSessions } from '../plugins/session-store.js';

/**
 * Database retention worker - prunes old rows from tables that grow unboundedly.
 * Runs daily.  All retention periods are in days.
 */

const RETENTION = {
  activityEvents: 90,
  notifications: 90,
  manifestRawManifest: 90, // null out rawManifest, keep metadata
  etagCache: 0, // prune legacy bloated etag rows immediately
};

export async function processDbRetention(): Promise<void> {
  let totalPruned = 0;

  // 1. Activity events older than 90 days
  const activityCutoff = new Date(Date.now() - RETENTION.activityEvents * 86_400_000);
  const activityResult = await db
    .delete(schema.activityEvents)
    .where(lt(schema.activityEvents.createdAt, activityCutoff));
  const activityPruned = activityResult.changes ?? 0;
  totalPruned += activityPruned;

  // 2. Notifications older than 90 days
  const notifCutoff = new Date(Date.now() - RETENTION.notifications * 86_400_000);
  const notifResult = await db
    .delete(schema.notifications)
    .where(lt(schema.notifications.sentAt, notifCutoff));
  const notifPruned = notifResult.changes ?? 0;
  totalPruned += notifPruned;

  // 3. Manifest pushes - null out rawManifest on entries older than 90 days
  const manifestCutoff = new Date(Date.now() - RETENTION.manifestRawManifest * 86_400_000);
  const manifestResult = await db
    .update(schema.manifestPushes)
    .set({ rawManifest: null })
    .where(
      and(
        lt(schema.manifestPushes.pushedAt, manifestCutoff),
        isNotNull(schema.manifestPushes.rawManifest),
      ),
    );
  const manifestPruned = manifestResult.changes ?? 0;
  totalPruned += manifestPruned;

  // 4. Prune legacy bloated ETag cache entries (stored full API responses)
  //    New code stores only the ETag string.  Any value that is a JSON object
  //    (not a plain string) is a legacy entry - shrink it to just the etag.
  const etagResult = db.run(sql`
    UPDATE settings
    SET value = json_quote(json_extract(value, '$.etag')),
        updated_at = (unixepoch() * 1000)
    WHERE key LIKE 'etag:github:%'
      AND json_type(value) = 'object'
      AND json_extract(value, '$.etag') IS NOT NULL
  `);
  const etagPruned = etagResult.changes ?? 0;
  totalPruned += etagPruned;

  // 5. Prune expired session rows (SQLite-backed session store)
  const sessionsPruned = cleanupExpiredSessions();
  totalPruned += sessionsPruned;

  logger.info(
    {
      activityPruned,
      notifPruned,
      manifestPruned,
      etagPruned,
      sessionsPruned,
      totalPruned,
    },
    'DB retention: cleanup complete',
  );
}
