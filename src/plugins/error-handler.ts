import fp from 'fastify-plugin';
import { FastifyInstance, FastifyError } from 'fastify';

export const errorHandler = fp(async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const message = error.message ?? 'Unknown error';

    app.log.error({
      err: error,
      url: request.url,
      method: request.method,
    });

    if (request.url.startsWith('/api/')) {
      return reply.status(statusCode).send({
        error: statusCode >= 500 ? 'Internal Server Error' : message,
        statusCode,
      });
    }

    return reply.status(statusCode).view('pages/error.ejs', {
      title: `Error ${statusCode}`,
      statusCode,
      message: statusCode >= 500 ? 'Something went wrong' : message,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found', statusCode: 404 });
    }
    return reply.status(404).view('pages/error.ejs', {
      title: 'Not Found',
      statusCode: 404,
      message: 'Page not found',
    });
  });
});
