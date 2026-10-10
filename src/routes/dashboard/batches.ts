import { FastifyInstance } from 'fastify';
import * as batchManager from '../../services/batch-manager.js';

export async function batchRoutes(app: FastifyInstance) {
  // List all batches
  app.get('/batches', async (request, reply) => {
    const { status } = request.query as { status?: string };
    const batches = await batchManager.listBatches(status || undefined);
    return reply.view('pages/batches.ejs', { title: 'Update Batches', batches });
  });

  // Batch detail page
  app.get<{ Params: { id: string } }>('/batches/:id', async (request, reply) => {
    const batch = await batchManager.getBatch(Number(request.params.id));
    if (!batch) {
      return reply.status(404).view('pages/batches.ejs', {
        title: 'Batch Not Found',
        batches: [],
        error: 'Batch not found',
      });
    }
    return reply.view('pages/batch-detail.ejs', { title: `Batch: ${batch.name}`, batch });
  });

  // Create batch - auto mode (from staleness score)
  app.post<{ Body: { mode: string; tier?: string; category?: string; name?: string; packages?: string } }>(
    '/batches/create',
    async (request, reply) => {
      const { mode, tier, category, name, packages: pkgList } = request.body ?? {};

      let batch: batchManager.BatchDetail;

      if (mode === 'auto') {
        const scoreMap: Record<string, number> = {
          critical: 25,
          high: 15,
          medium: 5,
          all: 0,
        };
        const minScore = scoreMap[tier ?? 'medium'] ?? 5;
        batch = await batchManager.createBatchFromScore(minScore, category || undefined);
      } else {
        // Manual mode
        const packageNames = (pkgList ?? '')
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (packageNames.length === 0) {
          return reply.redirect('/batches');
        }

        batch = await batchManager.createBatch(
          name || `Manual batch - ${new Date().toISOString().slice(0, 10)}`,
          packageNames,
        );
      }

      return reply.redirect(`/batches/${batch.id}`);
    },
  );

  // Toggle item status (HTMX)
  app.post<{ Params: { id: string }; Body: { package: string; status: string } }>(
    '/batches/:id/toggle',
    async (request, reply) => {
      const batchId = Number(request.params.id);
      const { package: pkgName, status } = request.body ?? {};
      const newStatus = status === 'completed' ? 'pending' : 'completed';

      await batchManager.updateItemStatus(batchId, pkgName, newStatus as 'pending' | 'completed');

      // Return updated batch detail partial
      const batch = await batchManager.getBatch(batchId);
      if (!batch) return reply.status(404).send('Batch not found');

      reply.header('Content-Type', 'text/html');
      return reply.view('partials/batch-items.ejs', { batch });
    },
  );

  // Complete entire batch (HTMX)
  app.post<{ Params: { id: string } }>(
    '/batches/:id/complete',
    async (request, reply) => {
      const batchId = Number(request.params.id);
      await batchManager.completeBatch(batchId);

      const batch = await batchManager.getBatch(batchId);
      if (!batch) return reply.status(404).send('Batch not found');

      reply.header('Content-Type', 'text/html');
      return reply.view('partials/batch-items.ejs', { batch });
    },
  );

  // Delete batch
  app.post<{ Params: { id: string } }>(
    '/batches/:id/delete',
    async (request, reply) => {
      await batchManager.deleteBatch(Number(request.params.id));
      return reply.redirect('/batches');
    },
  );

  // Copy as markdown (returns plain text)
  app.get<{ Params: { id: string } }>(
    '/batches/:id/markdown',
    async (request, reply) => {
      const batch = await batchManager.getBatch(Number(request.params.id));
      if (!batch) return reply.status(404).send('Batch not found');

      const md = batchManager.batchToMarkdown(batch);
      reply.header('Content-Type', 'text/plain');
      return reply.send(md);
    },
  );
}
