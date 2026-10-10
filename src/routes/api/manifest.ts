import { FastifyInstance } from 'fastify';
import { processManifest, type ManifestPayload } from '../../services/manifest.js';

const manifestSchema = {
  body: {
    type: 'object',
    required: ['packages'],
    properties: {
      packages: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string', minLength: 1 },
            version: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            depends: { type: 'array', items: { type: 'string' } },
            provides: { type: 'array', items: { type: 'string' } },
            groups: { type: 'array', items: { type: 'string' } },
            architecture: { type: 'string' },
            build_date: { type: 'string' },
            install_date: { type: 'string' },
          },
        },
      },
    },
  },
};

export async function manifestRoutes(app: FastifyInstance) {
  app.post<{ Body: ManifestPayload }>(
    '/api/v1/manifest',
    {
      schema: manifestSchema,
      preHandler: [app.verifyHmac],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const sourceIp = request.ip;
      const { diff, pushId } = await processManifest(request.body, sourceIp);

      return reply.status(200).send({
        pushId,
        diff: {
          added: diff.added.length,
          removed: diff.removed.length,
          updated: Object.keys(diff.updated).length,
          unchanged: diff.unchanged,
        },
        details: diff,
      });
    },
  );
}
