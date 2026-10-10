import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq, isNotNull, sql, inArray } from 'drizzle-orm';

export async function pinRoutes(app: FastifyInstance) {
  // PIN a package (exclude from updates)
  app.post<{ Params: { name: string }; Body: { reason?: string } }>(
    '/packages/:name/pin',
    async (request, reply) => {
      const { name } = request.params;
      const reason = (request.body as any)?.reason ?? null;

      const updated = await db
        .update(schema.packages)
        .set({ pinnedAt: new Date(), pinReason: reason })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name, pinnedAt: new Date().toISOString() });
    },
  );

  // UNPIN a package
  app.post<{ Params: { name: string } }>(
    '/packages/:name/unpin',
    async (request, reply) => {
      const { name } = request.params;

      const updated = await db
        .update(schema.packages)
        .set({ pinnedAt: null, pinReason: null })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name });
    },
  );

  // DEFER a package (exclude from updates count, but keep monitoring)
  // Also used as "adjust defer" - works on already-deferred packages to reset the timer.
  app.post<{ Params: { name: string }; Body: { reason?: string; days?: string } }>(
    '/packages/:name/defer',
    async (request, reply) => {
      const { name } = request.params;
      const body = request.body as any;
      const reason = (body?.['defer-reason'] || body?.reason || '').trim() || null;
      const daysRaw = body?.['defer-days'] || body?.days;
      const deferDays = daysRaw ? Math.max(1, Math.min(3650, parseInt(daysRaw, 10) || 30)) : 30;

      const updated = await db
        .update(schema.packages)
        .set({ deferredAt: new Date(), deferReason: reason, deferDays })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name, deferredAt: new Date().toISOString(), deferDays });
    },
  );

  // UNDEFER a package
  app.post<{ Params: { name: string } }>(
    '/packages/:name/undefer',
    async (request, reply) => {
      const { name } = request.params;

      const updated = await db
        .update(schema.packages)
        .set({ deferredAt: null, deferReason: null, deferDays: null })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name });
    },
  );

  // WATCH a package (get immediate alerts for new upstream versions)
  app.post<{ Params: { name: string } }>(
    '/packages/:name/watch',
    async (request, reply) => {
      const { name } = request.params;

      const updated = await db
        .update(schema.packages)
        .set({ watchedAt: new Date() })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name, watchedAt: new Date().toISOString() });
    },
  );

  // UNWATCH a package
  app.post<{ Params: { name: string } }>(
    '/packages/:name/unwatch',
    async (request, reply) => {
      const { name } = request.params;

      const updated = await db
        .update(schema.packages)
        .set({ watchedAt: null })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });

      if (updated.length === 0) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      return reply.send({ ok: true, name });
    },
  );

  // BULK PIN
  app.post<{ Body: { names: string[]; reason?: string } }>(
    '/packages/bulk/pin',
    async (request, reply) => {
      const { names, reason } = request.body as any;
      if (!Array.isArray(names) || names.length === 0) {
        return reply.status(400).send({ error: 'No packages specified' });
      }
      const updated = await db
        .update(schema.packages)
        .set({ pinnedAt: new Date(), pinReason: reason ?? null })
        .where(inArray(schema.packages.name, names))
        .returning({ name: schema.packages.name });
      const foundNames = new Set(updated.map(r => r.name));
      const notFound = names.filter(n => !foundNames.has(n));
      return reply.send({
        ok: true,
        found: updated.length,
        requested: names.length,
        ...(notFound.length > 0 && { notFound }),
      });
    },
  );

  // BULK DEFER
  app.post<{ Body: { names: string[]; reason?: string; days?: string } }>(
    '/packages/bulk/defer',
    async (request, reply) => {
      const body = request.body as any;
      const names = body.names;
      if (!Array.isArray(names) || names.length === 0) {
        return reply.status(400).send({ error: 'No packages specified' });
      }
      const reason = (body.reason || '').trim() || null;
      const deferDays = body.days ? Math.max(1, Math.min(3650, parseInt(body.days, 10) || 30)) : 30;
      const updated = await db
        .update(schema.packages)
        .set({ deferredAt: new Date(), deferReason: reason, deferDays })
        .where(inArray(schema.packages.name, names))
        .returning({ name: schema.packages.name });
      const foundNames = new Set(updated.map(r => r.name));
      const notFound = names.filter(n => !foundNames.has(n));
      return reply.send({
        ok: true,
        found: updated.length,
        requested: names.length,
        ...(notFound.length > 0 && { notFound }),
      });
    },
  );

  // List all pinned packages
  app.get('/pinned', async (_request, reply) => {
    const pinned = await db
      .select({
        id: schema.packages.id,
        name: schema.packages.name,
        version: schema.packages.version,
        pinnedAt: schema.packages.pinnedAt,
        pinReason: schema.packages.pinReason,
        groups: schema.packages.groups,
      })
      .from(schema.packages)
      .where(isNotNull(schema.packages.pinnedAt))
      .orderBy(schema.packages.pinnedAt);

    return reply.view('pages/pinned.ejs', {
      title: 'Pinned Packages',
      packages: pinned,
    });
  });
}
