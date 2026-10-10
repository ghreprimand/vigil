import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { desc } from 'drizzle-orm';

type Push = typeof schema.manifestPushes.$inferSelect;

interface PushGroup {
  startTime: Date;
  endTime: Date;
  pushCount: number;
  packagesUpdated: Record<string, { from: string; to: string }>;
  packagesAdded: string[];
  packagesRemoved: string[];
}

/** Compute a profile key for a push: which change types are present */
function pushProfile(push: Push): string {
  const hasUpdated = Object.keys(push.packagesUpdated ?? {}).length > 0;
  const hasAdded = (push.packagesAdded ?? []).length > 0;
  const hasRemoved = (push.packagesRemoved ?? []).length > 0;
  if (!hasUpdated && !hasAdded && !hasRemoved) return 'none';
  const parts: string[] = [];
  if (hasUpdated) parts.push('u');
  if (hasAdded) parts.push('a');
  if (hasRemoved) parts.push('r');
  return parts.join('+');
}

const GROUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/** Group consecutive pushes with the same profile within a time window */
function groupPushes(pushes: Push[]): PushGroup[] {
  if (pushes.length === 0) return [];

  const groups: PushGroup[] = [];
  let cur: PushGroup = {
    startTime: new Date(pushes[0].pushedAt),
    endTime: new Date(pushes[0].pushedAt),
    pushCount: 1,
    packagesUpdated: { ...(pushes[0].packagesUpdated ?? {}) },
    packagesAdded: [...(pushes[0].packagesAdded ?? [])],
    packagesRemoved: [...(pushes[0].packagesRemoved ?? [])],
  };
  let curProfile = pushProfile(pushes[0]);

  for (let i = 1; i < pushes.length; i++) {
    const push = pushes[i];
    const profile = pushProfile(push);
    const pushTime = new Date(push.pushedAt);

    // Pushes are DESC - so cur.endTime >= pushTime
    const gap = cur.endTime.getTime() - pushTime.getTime();

    if (profile === curProfile && gap <= GROUP_WINDOW_MS) {
      // Merge into current group
      cur.startTime = pushTime; // earlier time (pushes are DESC)
      cur.pushCount++;
      // Merge updated packages
      for (const [name, change] of Object.entries(push.packagesUpdated ?? {})) {
        if (cur.packagesUpdated[name]) {
          // This push is older, so its version is the earlier "from"
          cur.packagesUpdated[name] = { from: change.from, to: cur.packagesUpdated[name].to };
        } else {
          cur.packagesUpdated[name] = { ...change };
        }
      }
      // Merge added/removed (deduplicate)
      for (const pkg of push.packagesAdded ?? []) {
        if (!cur.packagesAdded.includes(pkg)) cur.packagesAdded.push(pkg);
      }
      for (const pkg of push.packagesRemoved ?? []) {
        if (!cur.packagesRemoved.includes(pkg)) cur.packagesRemoved.push(pkg);
      }
    } else {
      // Start a new group
      groups.push(cur);
      cur = {
        startTime: pushTime,
        endTime: pushTime,
        pushCount: 1,
        packagesUpdated: { ...(push.packagesUpdated ?? {}) },
        packagesAdded: [...(push.packagesAdded ?? [])],
        packagesRemoved: [...(push.packagesRemoved ?? [])],
      };
      curProfile = profile;
    }
  }
  groups.push(cur);
  return groups;
}

export async function activityRoutes(app: FastifyInstance) {
  app.get('/activity', async (_request, reply) => {
    const pushes = await db
      .select()
      .from(schema.manifestPushes)
      .orderBy(desc(schema.manifestPushes.pushedAt))
      .limit(200);

    const events = await db
      .select()
      .from(schema.activityEvents)
      .orderBy(desc(schema.activityEvents.createdAt))
      .limit(200);

    const groups = groupPushes(pushes);

    let totalUpdated = 0;
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const push of pushes) {
      totalUpdated += Object.keys(push.packagesUpdated ?? {}).length;
      totalAdded += (push.packagesAdded ?? []).length;
      totalRemoved += (push.packagesRemoved ?? []).length;
    }

    return reply.view('pages/activity.ejs', {
      title: 'Activity',
      groups,
      events,
      totalPushes: pushes.length,
      totalUpdated,
      totalAdded,
      totalRemoved,
    });
  });
}
