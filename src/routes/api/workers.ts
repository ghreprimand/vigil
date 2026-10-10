import { FastifyInstance } from 'fastify';
import { triggerWorker, getWorkerNames, getWorkerStatus, getWorkerHealth } from '../../workers/index.js';

export async function workerApiRoutes(app: FastifyInstance) {
  // Trigger a specific worker to run immediately
  app.post<{ Params: { name: string } }>(
    '/api/v1/workers/:name/trigger',
    { preHandler: [app.verifyHmac] },
    async (request, reply) => {
      const { name } = request.params;
      const valid = getWorkerNames();

      if (!valid.includes(name)) {
        return reply.status(404).send({
          error: `Unknown worker: "${name}"`,
          valid_workers: valid,
        });
      }

      const ok = await triggerWorker(name);
      if (!ok) {
        return reply.status(503).send({
          error: 'Worker not available - server may still be initialising',
        });
      }

      return reply.send({ ok: true, worker: name, message: `Job queued for ${name}` });
    },
  );

  // List all worker names and schedules
  app.get(
    '/api/v1/workers',
    { preHandler: [app.verifyHmac] },
    async (_request, reply) => {
      return reply.send({ workers: getWorkerStatus() });
    },
  );

  // Detailed worker health with last-run times and failure info
  app.get(
    '/api/v1/workers/health',
    { preHandler: [app.verifyHmac] },
    async (_request, reply) => {
      const health = await getWorkerHealth();
      const hasFailures = health.some((w) => w.consecutiveFailures > 0);
      return reply.send({
        status: hasFailures ? 'degraded' : 'healthy',
        workers: health,
      });
    },
  );
}
