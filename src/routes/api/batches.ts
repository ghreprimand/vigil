import { FastifyInstance } from 'fastify';
import * as batchManager from '../../services/batch-manager.js';

export async function batchApiRoutes(app: FastifyInstance) {
  // List batches
  app.get(
    '/api/v1/batches',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { status } = request.query as { status?: string };
      const batches = await batchManager.listBatches(status || undefined);
      return reply.send({ batches });
    },
  );

  // Get batch detail
  app.get<{ Params: { id: string } }>(
    '/api/v1/batches/:id',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const batch = await batchManager.getBatch(Number(request.params.id));
      if (!batch) return reply.status(404).send({ error: 'Batch not found' });
      return reply.send(batch);
    },
  );

  // Create batch
  app.post<{ Body: { tier?: string; category?: string; name?: string; packages?: string[] } }>(
    '/api/v1/batches',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { tier, category, name, packages: pkgList } = request.body ?? {};

      let batch: batchManager.BatchDetail;

      if (pkgList && pkgList.length > 0) {
        batch = await batchManager.createBatch(
          name || `CLI batch - ${new Date().toISOString().slice(0, 10)}`,
          pkgList,
        );
      } else {
        const scoreMap: Record<string, number> = {
          critical: 25,
          high: 15,
          medium: 5,
          all: 0,
        };
        const minScore = scoreMap[tier ?? 'medium'] ?? 5;
        batch = await batchManager.createBatchFromScore(minScore, category || undefined);
      }

      return reply.send(batch);
    },
  );

  // Mark item done
  app.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/v1/batches/:id/done',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const batchId = Number(request.params.id);
      const { package: pkgName } = request.body ?? {};

      if (!pkgName) return reply.status(400).send({ error: 'package name required' });

      const ok = await batchManager.updateItemStatus(batchId, pkgName, 'completed');
      if (!ok) return reply.status(404).send({ error: 'Batch item not found' });

      const batch = await batchManager.getBatch(batchId);
      return reply.send(batch);
    },
  );

  // Delete batch
  app.delete<{ Params: { id: string } }>(
    '/api/v1/batches/:id',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const ok = await batchManager.deleteBatch(Number(request.params.id));
      if (!ok) return reply.status(404).send({ error: 'Batch not found' });
      return reply.send({ ok: true });
    },
  );
}
