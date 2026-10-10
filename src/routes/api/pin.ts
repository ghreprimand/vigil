import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

export async function pinApiRoutes(app: FastifyInstance) {
  app.post<{ Params: { name: string }; Body: { reason?: string } }>(
    '/api/v1/packages/:name/pin',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const reason = (request.body as any)?.reason ?? null;
      const updated = await db
        .update(schema.packages)
        .set({ pinnedAt: new Date(), pinReason: reason })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });
      if (updated.length === 0) return reply.status(404).send({ error: 'Package not found' });
      return reply.send({ ok: true, name });
    },
  );

  app.post<{ Params: { name: string } }>(
    '/api/v1/packages/:name/unpin',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const updated = await db
        .update(schema.packages)
        .set({ pinnedAt: null, pinReason: null })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });
      if (updated.length === 0) return reply.status(404).send({ error: 'Package not found' });
      return reply.send({ ok: true, name });
    },
  );

  app.post<{ Params: { name: string }; Body: { reason?: string } }>(
    '/api/v1/packages/:name/defer',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const reason = ((request.body as any)?.reason || '').trim() || null;
      const updated = await db
        .update(schema.packages)
        .set({ deferredAt: new Date(), deferReason: reason })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });
      if (updated.length === 0) return reply.status(404).send({ error: 'Package not found' });
      return reply.send({ ok: true, name });
    },
  );

  app.delete<{ Params: { name: string } }>(
    '/api/v1/packages/:name',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const deleted = await db
        .delete(schema.packages)
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });
      if (deleted.length === 0) return reply.status(404).send({ error: 'Package not found' });
      return reply.send({ ok: true, name });
    },
  );

  app.post<{ Params: { name: string } }>(
    '/api/v1/packages/:name/undefer',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const updated = await db
        .update(schema.packages)
        .set({ deferredAt: null, deferReason: null })
        .where(eq(schema.packages.name, name))
        .returning({ id: schema.packages.id });
      if (updated.length === 0) return reply.status(404).send({ error: 'Package not found' });
      return reply.send({ ok: true, name });
    },
  );
}
