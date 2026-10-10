import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq, sql, desc } from 'drizzle-orm';

export async function kbRoutes(app: FastifyInstance) {
  // List KB documents
  app.get('/kb', async (request, reply) => {
    const { q = '', tag = '' } = request.query as { q?: string; tag?: string };

    const conditions = [];
    if (q) {
      conditions.push(sql`(title LIKE ${`%${q}%`} OR body LIKE ${`%${q}%`})`);
    }
    if (tag) {
      conditions.push(sql`EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ${tag})`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const docs = await db.execute(sql`
      SELECT kd.*,
        COALESCE(
          (SELECT json_group_array(json_object('name', name))
           FROM (SELECT p.name FROM kb_document_packages kp JOIN packages p ON kp.package_id = p.id
                 WHERE kp.document_id = kd.id ORDER BY p.name)),
          json_array()
        ) AS linked_packages
      FROM kb_documents kd ${whereClause}
      ORDER BY kd.updated_at DESC
    `);

    // Get all distinct tags
    const tagRows = await db.execute(sql`
      SELECT DISTINCT je.value AS tag
      FROM kb_documents, json_each(kb_documents.tags) je
      WHERE json_array_length(kb_documents.tags) > 0
      ORDER BY tag
    `);
    const allTags = tagRows.map((r: any) => r.tag);

    return reply.view('pages/kb-list.ejs', {
      title: 'Knowledge Base',
      navSection: 'kb',
      docs,
      allTags,
      query: q,
      activeTag: tag,
    });
  });

  // New document form
  app.get('/kb/new', async (request, reply) => {
    const allPackages = await db.select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages)
      .orderBy(schema.packages.name);

    return reply.view('pages/kb-form.ejs', {
      title: 'New KB Article',
      navSection: 'kb',
      doc: null,
      linkedPackageIds: [],
      allPackages,
    });
  });

  // View document
  app.get<{ Params: { slug: string } }>('/kb/:slug', async (request, reply) => {
    const { slug } = request.params;
    const [doc] = await db.select().from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.slug, slug)).limit(1);

    if (!doc) {
      return reply.status(404).view('pages/error.ejs', {
        title: 'Not Found', statusCode: 404, message: `KB article "${slug}" not found`,
      });
    }

    // Get linked packages
    const linkedPkgs = await db.execute(sql`
      SELECT p.id, p.name, p.version FROM kb_document_packages kp
      JOIN packages p ON kp.package_id = p.id
      WHERE kp.document_id = ${doc.id}
      ORDER BY p.name
    `);

    // Get advisories linked to this KB doc
    const linkedAdvisories = await db.execute(sql`
      SELECT id, title, severity, resolved_at FROM advisories
      WHERE kb_document_id = ${doc.id}
      ORDER BY created_at DESC
    `);

    return reply.view('pages/kb-view.ejs', {
      title: doc.title,
      navSection: 'kb',
      doc,
      linkedPackages: linkedPkgs,
      linkedAdvisories,
    });
  });

  // Edit form
  app.get<{ Params: { slug: string } }>('/kb/:slug/edit', async (request, reply) => {
    const { slug } = request.params;
    const [doc] = await db.select().from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.slug, slug)).limit(1);

    if (!doc) {
      return reply.status(404).view('pages/error.ejs', {
        title: 'Not Found', statusCode: 404, message: `KB article "${slug}" not found`,
      });
    }

    const linkedRows = await db.select({ packageId: schema.kbDocumentPackages.packageId })
      .from(schema.kbDocumentPackages)
      .where(eq(schema.kbDocumentPackages.documentId, doc.id));
    const linkedPackageIds = linkedRows.map(r => r.packageId);

    const allPackages = await db.select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages)
      .orderBy(schema.packages.name);

    return reply.view('pages/kb-form.ejs', {
      title: `Edit: ${doc.title}`,
      navSection: 'kb',
      doc,
      linkedPackageIds,
      allPackages,
    });
  });

  // Create document
  app.post('/kb', async (request, reply) => {
    const { title, slug, body, tags, packages: packageIds, create_advisory, advisory_severity } = request.body as {
      title: string; slug: string; body: string; tags: string; packages?: string | string[];
      create_advisory?: string; advisory_severity?: string;
    };

    const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const [doc] = await db.insert(schema.kbDocuments).values({
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
      title,
      body: body || '',
      tags: tagArray,
    }).returning();

    // Link packages
    const pkgIds = normalizeIds(packageIds);
    if (pkgIds.length > 0) {
      await db.insert(schema.kbDocumentPackages).values(
        pkgIds.map(pid => ({ documentId: doc.id, packageId: pid }))
      );
    }

    // Optionally create an advisory with same title, packages, and linked KB doc
    if (create_advisory === '1' && pkgIds.length > 0) {
      const severity = ['info', 'warning', 'critical'].includes(advisory_severity || '')
        ? advisory_severity! : 'warning';

      const [advisory] = await db.insert(schema.advisories).values({
        title,
        description: '',
        severity,
        kbDocumentId: doc.id,
      }).returning();

      await db.insert(schema.advisoryPackages).values(
        pkgIds.map(pid => ({ advisoryId: advisory.id, packageId: pid }))
      );
    }

    return reply.redirect(`/kb/${doc.slug}`);
  });

  // Update document
  app.post<{ Params: { slug: string } }>('/kb/:slug', async (request, reply) => {
    const { slug } = request.params;
    const { title, newSlug, body, tags, packages: packageIds } = request.body as {
      title: string; newSlug?: string; body: string; tags: string; packages?: string | string[];
    };

    const [doc] = await db.select().from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.slug, slug)).limit(1);
    if (!doc) return reply.status(404).view('pages/error.ejs', {
      title: 'Not Found', statusCode: 404, message: 'Article not found',
    });

    const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const finalSlug = newSlug
      ? newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      : slug;

    await db.update(schema.kbDocuments).set({
      title,
      slug: finalSlug,
      body: body || '',
      tags: tagArray,
      updatedAt: new Date(),
    }).where(eq(schema.kbDocuments.id, doc.id));

    // Re-link packages
    await db.delete(schema.kbDocumentPackages)
      .where(eq(schema.kbDocumentPackages.documentId, doc.id));

    const pkgIds = normalizeIds(packageIds);
    if (pkgIds.length > 0) {
      await db.insert(schema.kbDocumentPackages).values(
        pkgIds.map(pid => ({ documentId: doc.id, packageId: pid }))
      );
    }

    return reply.redirect(`/kb/${finalSlug}`);
  });

  // Delete document
  app.post<{ Params: { slug: string } }>('/kb/:slug/delete', async (request, reply) => {
    const { delete_advisories } = (request.body || {}) as { delete_advisories?: string };

    const [doc] = await db.select({ id: schema.kbDocuments.id })
      .from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.slug, request.params.slug)).limit(1);

    if (doc && delete_advisories === '1') {
      await db.delete(schema.advisories)
        .where(eq(schema.advisories.kbDocumentId, doc.id));
    }

    await db.delete(schema.kbDocuments)
      .where(eq(schema.kbDocuments.slug, request.params.slug));
    return reply.redirect('/kb');
  });
}

function normalizeIds(val: string | string[] | undefined): number[] {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
}
