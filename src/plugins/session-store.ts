import { eq, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

type Callback = (err?: unknown) => void;
type CallbackSession = (err: unknown, result?: any | null) => void;

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours, matches cookie maxAge

/**
 * Minimal SQLite-backed session store for @fastify/session. Persists each
 * session as JSON in the `sessions` table with an absolute expiry timestamp
 * (unix ms). Expired rows are ignored on read and pruned by cleanup().
 */
export class SqliteSessionStore {
  set(sessionId: string, session: any, callback: Callback): void {
    try {
      const maxAge = session?.cookie?.maxAge;
      const expires = Date.now() + (typeof maxAge === 'number' ? maxAge : DEFAULT_TTL_MS);
      db.insert(schema.sessions)
        .values({ sid: sessionId, sess: session, expires })
        .onConflictDoUpdate({
          target: schema.sessions.sid,
          set: { sess: session, expires },
        })
        .run();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  get(sessionId: string, callback: CallbackSession): void {
    try {
      const [row] = db
        .select({ sess: schema.sessions.sess, expires: schema.sessions.expires })
        .from(schema.sessions)
        .where(eq(schema.sessions.sid, sessionId))
        .limit(1)
        .all();

      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        db.delete(schema.sessions).where(eq(schema.sessions.sid, sessionId)).run();
        return callback(null, null);
      }
      callback(null, row.sess);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sessionId: string, callback: Callback): void {
    try {
      db.delete(schema.sessions).where(eq(schema.sessions.sid, sessionId)).run();
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

/** Prune expired session rows. Called by the db-retention worker. */
export function cleanupExpiredSessions(): number {
  const result = db.delete(schema.sessions).where(lt(schema.sessions.expires, Date.now())).run();
  return result.changes ?? 0;
}
