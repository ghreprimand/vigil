import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq, sql, desc, isNull, isNotNull } from 'drizzle-orm';

export async function advisoryRoutes(app: FastifyInstance) {
  // List advisories
  app.get('/advisories', async (request, reply) => {
    const { severity = '', resolved = '' } = request.query as { severity?: string; resolved?: string };

    const conditions = [];
    if (severity) {
      conditions.push(sql`a.severity = ${severity}`);
    }
    if (resolved !== 'all') {
      conditions.push(sql`a.resolved_at IS NULL`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT a.*,
        COALESCE(
          (SELECT json_group_array(json_object('id', p.id, 'name', p.name))
           FROM advisory_packages ap JOIN packages p ON ap.package_id = p.id
           WHERE ap.advisory_id = a.id),
          json_array()
        ) AS packages,
        kd.title AS kb_title, kd.slug AS kb_slug
      FROM advisories a
      LEFT JOIN kb_documents kd ON a.kb_document_id = kd.id
      ${whereClause}
      ORDER BY
        CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        a.created_at DESC
    `);

    return reply.view('pages/advisories-list.ejs', {
      title: 'Advisories',
      navSection: 'advisories',
      advisories: rows,
      severityFilter: severity,
      resolvedFilter: resolved,
    });
  });

  // New advisory form
  app.get('/advisories/new', async (request, reply) => {
    const allPackages = await db.select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages).orderBy(schema.packages.name);

    const kbDocs = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title })
      .from(schema.kbDocuments).orderBy(desc(schema.kbDocuments.updatedAt));

    return reply.view('pages/advisory-form.ejs', {
      title: 'New Advisory',
      navSection: 'advisories',
      advisory: null,
      linkedPackageIds: [],
      allPackages,
      kbDocs,
    });
  });

  // View advisory
  app.get<{ Params: { id: string } }>('/advisories/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const [advisory] = await db.select().from(schema.advisories)
      .where(eq(schema.advisories.id, id)).limit(1);

    if (!advisory) {
      return reply.status(404).view('pages/error.ejs', {
        title: 'Not Found', statusCode: 404, message: 'Advisory not found',
      });
    }

    const linkedPkgs = await db.execute(sql`
      SELECT p.id, p.name, p.version FROM advisory_packages ap
      JOIN packages p ON ap.package_id = p.id
      WHERE ap.advisory_id = ${id}
      ORDER BY p.name
    `);

    let kbDoc = null;
    if (advisory.kbDocumentId) {
      const [doc] = await db.select().from(schema.kbDocuments)
        .where(eq(schema.kbDocuments.id, advisory.kbDocumentId)).limit(1);
      kbDoc = doc || null;
    }

    return reply.view('pages/advisory-view.ejs', {
      title: advisory.title,
      navSection: 'advisories',
      advisory,
      linkedPackages: linkedPkgs,
      kbDoc,
    });
  });

  // Edit form
  app.get<{ Params: { id: string } }>('/advisories/:id/edit', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const [advisory] = await db.select().from(schema.advisories)
      .where(eq(schema.advisories.id, id)).limit(1);

    if (!advisory) {
      return reply.status(404).view('pages/error.ejs', {
        title: 'Not Found', statusCode: 404, message: 'Advisory not found',
      });
    }

    const linkedRows = await db.select({ packageId: schema.advisoryPackages.packageId })
      .from(schema.advisoryPackages)
      .where(eq(schema.advisoryPackages.advisoryId, id));
    const linkedPackageIds = linkedRows.map(r => r.packageId);

    const allPackages = await db.select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages).orderBy(schema.packages.name);

    const kbDocs = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title })
      .from(schema.kbDocuments).orderBy(desc(schema.kbDocuments.updatedAt));

    return reply.view('pages/advisory-form.ejs', {
      title: `Edit: ${advisory.title}`,
      navSection: 'advisories',
      advisory,
      linkedPackageIds,
      allPackages,
      kbDocs,
    });
  });

  // Create advisory
  app.post('/advisories', async (request, reply) => {
    const { title, description, severity, kb_document_id, packages: packageIds } = request.body as {
      title: string; description: string; severity: string;
      kb_document_id?: string; packages?: string | string[];
    };

    const kbDocId = kb_document_id ? parseInt(kb_document_id, 10) : null;

    const [advisory] = await db.insert(schema.advisories).values({
      title,
      description: description || '',
      severity: severity || 'info',
      kbDocumentId: kbDocId && !isNaN(kbDocId) ? kbDocId : null,
    }).returning();

    const pkgIds = normalizeIds(packageIds);
    if (pkgIds.length > 0) {
      await db.insert(schema.advisoryPackages).values(
        pkgIds.map(pid => ({ advisoryId: advisory.id, packageId: pid }))
      );
    }

    return reply.redirect(`/advisories/${advisory.id}`);
  });

  // Update advisory
  app.post<{ Params: { id: string } }>('/advisories/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const { title, description, severity, kb_document_id, packages: packageIds } = request.body as {
      title: string; description: string; severity: string;
      kb_document_id?: string; packages?: string | string[];
    };

    const kbDocId = kb_document_id ? parseInt(kb_document_id, 10) : null;

    await db.update(schema.advisories).set({
      title,
      description: description || '',
      severity: severity || 'info',
      kbDocumentId: kbDocId && !isNaN(kbDocId) ? kbDocId : null,
      updatedAt: new Date(),
    }).where(eq(schema.advisories.id, id));

    // Re-link packages
    await db.delete(schema.advisoryPackages)
      .where(eq(schema.advisoryPackages.advisoryId, id));

    const pkgIds = normalizeIds(packageIds);
    if (pkgIds.length > 0) {
      await db.insert(schema.advisoryPackages).values(
        pkgIds.map(pid => ({ advisoryId: id, packageId: pid }))
      );
    }

    return reply.redirect(`/advisories/${id}`);
  });

  // Resolve advisory
  app.post<{ Params: { id: string } }>('/advisories/:id/resolve', async (request, reply) => {
    await db.update(schema.advisories).set({
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.advisories.id, parseInt(request.params.id, 10)));

    return reply.redirect(`/advisories/${request.params.id}`);
  });

  // Delete advisory
  app.post<{ Params: { id: string } }>('/advisories/:id/delete', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const { delete_kb } = (request.body || {}) as { delete_kb?: string };

    if (delete_kb === '1') {
      const [advisory] = await db.select({ kbDocumentId: schema.advisories.kbDocumentId })
        .from(schema.advisories).where(eq(schema.advisories.id, id)).limit(1);
      if (advisory?.kbDocumentId) {
        await db.delete(schema.kbDocuments)
          .where(eq(schema.kbDocuments.id, advisory.kbDocumentId));
      }
    }

    await db.delete(schema.advisories).where(eq(schema.advisories.id, id));
    return reply.redirect('/advisories');
  });
}

function normalizeIds(val: string | string[] | undefined): number[] {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
}
