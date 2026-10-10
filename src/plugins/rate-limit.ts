import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export const rateLimitPlugin = fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: false,
  });
});
