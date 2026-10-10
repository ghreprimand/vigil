import { FastifyInstance } from 'fastify';
import { helpContent } from '../../data/help-content.js';

export async function helpContentRoutes(app: FastifyInstance) {
  app.get('/api/v1/help-content', async (_request, reply) => {
    return reply.send(helpContent);
  });
}
