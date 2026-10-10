import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

interface SourceSeed {
  package: string;
  source_type: string;
  config: Record<string, unknown>;
  check_interval?: number;
}

interface SeedBody {
  sources: SourceSeed[];
}

const seedSchema = {
  body: {
    type: 'object',
    required: ['sources'],
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          required: ['package', 'source_type', 'config'],
          properties: {
            package: { type: 'string', minLength: 1 },
            source_type: { type: 'string', enum: ['github', 'gitlab', 'kernel', 'kde', 'gnu', 'pypi', 'qt', 'generic', 'flathub'] },
            config: { type: 'object' },
            check_interval: { type: 'number', minimum: 300 },
          },
        },
      },
    },
  },
};

export async function sourcesRoutes(app: FastifyInstance) {
  app.post<{ Body: SeedBody }>(
    '/api/v1/sources/seed',
    {
      schema: seedSchema,
      preHandler: [app.verifyHmac],
    },
    async (request, reply) => {
      const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

      for (const src of request.body.sources) {
        // Find the package
        const [pkg] = await db
          .select({ id: schema.packages.id })
          .from(schema.packages)
          .where(eq(schema.packages.name, src.package))
          .limit(1);

        if (!pkg) {
          results.skipped++;
          results.errors.push(`Package not found: ${src.package}`);
          continue;
        }

        // Upsert: check if source exists for this package+type
        const [existing] = await db
          .select({ id: schema.upstreamSources.id })
          .from(schema.upstreamSources)
          .where(eq(schema.upstreamSources.packageId, pkg.id))
          .limit(1);

        if (existing) {
          await db
            .update(schema.upstreamSources)
            .set({
              sourceType: src.source_type,
              config: src.config,
              ...(src.check_interval && { checkInterval: src.check_interval }),
            })
            .where(eq(schema.upstreamSources.id, existing.id));
          results.updated++;
        } else {
          await db.insert(schema.upstreamSources).values({
            packageId: pkg.id,
            sourceType: src.source_type,
            config: src.config,
            checkInterval: src.check_interval ?? 14400,
          });
          results.created++;
        }
      }

      return reply.send(results);
    },
  );
}
