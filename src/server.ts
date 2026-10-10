import Fastify from 'fastify';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { resolve } from 'path';
import os from 'os';
import ejs from 'ejs';

import { brand, config } from './config.js';
import { fmtDate, fmtDateTime } from './utils/dates.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './plugins/error-handler.js';
import { getSavedTheme } from './services/theme.js';
import { hmacAuth, sessionAuth, csrfCheck } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { SqliteSessionStore } from './plugins/session-store.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './db/index.js';

// Routes
import { statusRoutes } from './routes/api/status.js';
import { manifestRoutes } from './routes/api/manifest.js';
import { sourcesRoutes } from './routes/api/sources.js';
import { updatesApiRoutes } from './routes/api/updates.js';
import { coverageRoutes } from './routes/api/coverage.js';
import { rebuildPlanRoutes } from './routes/api/rebuild-plan.js';
import { pinApiRoutes } from './routes/api/pin.js';
import { workerApiRoutes } from './routes/api/workers.js';
import { batchApiRoutes } from './routes/api/batches.js';
import { helpContentRoutes } from './routes/api/help-content.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard/index.js';
import { packageDetailRoutes } from './routes/dashboard/package-detail.js';
import { cveRoutes } from './routes/dashboard/cve-detail.js';
import { settingsRoutes } from './routes/dashboard/settings.js';
import { updatesRoutes } from './routes/dashboard/updates.js';
import { helpRoutes } from './routes/dashboard/help.js';
import { activityRoutes } from './routes/dashboard/activity.js';
import { pinRoutes } from './routes/dashboard/pin.js';
import { sourceManagementRoutes } from './routes/dashboard/sources.js';
import { kbRoutes } from './routes/dashboard/kb.js';
import { advisoryRoutes } from './routes/dashboard/advisories.js';
import { overviewRoutes } from './routes/dashboard/overview.js';
import { graphRoutes } from './routes/dashboard/graph.js';
import { batchRoutes } from './routes/dashboard/batches.js';
import { coverageDashboardRoutes } from './routes/dashboard/coverage.js';
import { renderMarkdown } from './utils/markdown.js';

// Workers
import { startWorkers, stopWorkers } from './workers/index.js';
import { reseedStaticMappings } from './services/auto-detect-upstream.js';

const app = Fastify({
  logger: {
    level: config.logLevel,
    ...(config.nodeEnv === 'development' && {
      transport: { target: 'pino-pretty' },
    }),
  },
  trustProxy: true,
});

// Run database migrations before serving (auto-migrate at startup).
migrate(db, { migrationsFolder: resolve(config.projectRoot, 'drizzle') });
logger.info('Database migrations applied');

// Plugins
await app.register(fastifyFormbody);
await app.register(fastifyCookie);
await app.register(fastifySession, {
  store: new SqliteSessionStore() as any,
  secret: config.session.secret,
  cookie: {
    secure: config.session.cookieSecure,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 48 * 60 * 60 * 1000, // 48 hours
  },
});

await app.register(fastifyStatic, {
  root: resolve(config.projectRoot, 'public'),
  prefix: '/public/',
});

await app.register(fastifyView, {
  engine: { ejs },
  root: resolve(config.projectRoot, 'src', 'views'),
  layout: 'layouts/base.ejs',
  defaultContext: {
    title: '',
    user: null,
    fmtDate,
    fmtDateTime,
    renderMarkdown,
  },
});

// Custom plugins
await app.register(rateLimitPlugin);
await app.register(hmacAuth);
await app.register(sessionAuth);
await app.register(errorHandler);

// Inject user + theme + server uptime into view context for all requests
app.addHook('preHandler', async (request, reply) => {
  const user = request.session?.get('user') ?? null;
  const savedTheme = await getSavedTheme();
  const serverUptime = '';

  (reply as any).locals = { ...(reply as any).locals, user, savedTheme, serverUptime, brand };
});

// Public routes (no auth)
await app.register(statusRoutes);
await app.register(authRoutes);

// API routes (HMAC auth)
await app.register(manifestRoutes);
await app.register(sourcesRoutes);
await app.register(updatesApiRoutes);
await app.register(coverageRoutes);
await app.register(rebuildPlanRoutes);
await app.register(pinApiRoutes);
await app.register(workerApiRoutes);
await app.register(batchApiRoutes);
await app.register(helpContentRoutes);

// Dashboard routes (session auth)
await app.register(async function protectedRoutes(protectedApp) {
  protectedApp.addHook('preHandler', protectedApp.requireLogin);
  protectedApp.addHook('preHandler', csrfCheck);

  await protectedApp.register(overviewRoutes);
  await protectedApp.register(dashboardRoutes);
  await protectedApp.register(packageDetailRoutes);
  await protectedApp.register(cveRoutes);
  await protectedApp.register(updatesRoutes);
  await protectedApp.register(settingsRoutes);
  await protectedApp.register(helpRoutes);
  await protectedApp.register(activityRoutes);
  await protectedApp.register(pinRoutes);
  await protectedApp.register(sourceManagementRoutes);
  await protectedApp.register(kbRoutes);
  await protectedApp.register(advisoryRoutes);
  await protectedApp.register(graphRoutes);
  await protectedApp.register(batchRoutes);
  await protectedApp.register(coverageDashboardRoutes);
});

// Start server
try {
  await app.listen({ port: config.port, host: config.host });
  logger.info(`${brand.productName} listening on ${config.host}:${config.port}`);
} catch (err) {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
}

// Reseed static upstream mappings (applies upstream-mappings.ts edits to existing rows)
try {
  await reseedStaticMappings();
} catch (err) {
  logger.error(err, 'Failed to reseed static upstream mappings - continuing');
}

// Start background workers
try {
  await startWorkers();
  logger.info('Background workers started');
} catch (err) {
  logger.error(err, 'Failed to start workers - server running without background jobs');
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal, draining...');
  try {
    await stopWorkers();
    await app.close();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(err, 'Error during shutdown');
    process.exit(1);
  }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
