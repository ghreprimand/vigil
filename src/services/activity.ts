import { db, schema } from '../db/index.js';

export async function logActivity(
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.activityEvents).values({
    type,
    message,
    metadata: metadata ?? {},
  });
}
