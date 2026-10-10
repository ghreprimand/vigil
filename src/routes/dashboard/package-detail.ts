import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { logActivity } from '../../services/activity.js';

export async function packageDetailRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string }; Querystring: { saved?: string } }>('/packages/:name', async (request, reply) => {
    const { name } = request.params;
    const flash = request.query.saved === '1' ? 'Upstream source saved.' : null;

    const [pkg] = await db
      .select()
      .from(schema.packages)
      .where(eq(schema.packages.name, name))
      .limit(1);

    if (!pkg) {
      return reply.status(404).view('pages/error.ejs', {
        title: 'Not Found',
        statusCode: 404,
        message: `Package "${name}" not found`,
      });
    }

    // Get upstream releases
    const upstreamReleases = await db
      .select()
      .from(schema.upstreamReleases)
      .where(eq(schema.upstreamReleases.packageId, pkg.id))
      .orderBy(desc(schema.upstreamReleases.discoveredAt))
      .limit(10);

    // Get CVEs
    const cveRows = await db
      .select({
        cveId: schema.vulnerabilities.cveId,
        severity: schema.vulnerabilities.severity,
        cvssScore: schema.vulnerabilities.cvssScore,
        status: schema.vulnerabilities.status,
        fixedVersion: schema.vulnerabilities.fixedVersion,
      })
      .from(schema.packageVulnerabilities)
      .innerJoin(
        schema.vulnerabilities,
        eq(schema.packageVulnerabilities.vulnerabilityId, schema.vulnerabilities.id),
      )
      .where(eq(schema.packageVulnerabilities.packageId, pkg.id));

    // Get upstream source config
    const [source] = await db
      .select()
      .from(schema.upstreamSources)
      .where(eq(schema.upstreamSources.packageId, pkg.id))
      .limit(1);

    // Get active advisories for this package
    const activeAdvisories = await db.execute(sql`
      SELECT a.id, a.title, a.description, a.severity, a.kb_document_id,
        kd.slug AS kb_slug, kd.title AS kb_title
      FROM advisory_packages ap
      JOIN advisories a ON ap.advisory_id = a.id
      LEFT JOIN kb_documents kd ON a.kb_document_id = kd.id
      WHERE ap.package_id = ${pkg.id} AND a.resolved_at IS NULL
      ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
    `);

    // Get linked KB documents
    const kbDocs = await db.execute(sql`
      SELECT kd.slug, kd.title, kd.updated_at
      FROM kb_document_packages kp
      JOIN kb_documents kd ON kp.document_id = kd.id
      WHERE kp.package_id = ${pkg.id}
      ORDER BY kd.updated_at DESC
    `);

    // Get version history from manifest pushes
    const historyRows = await db.execute(sql`
      SELECT id, pushed_at, packages_added, packages_updated, packages_removed
      FROM manifest_pushes
      WHERE EXISTS (SELECT 1 FROM json_each(packages_updated) WHERE key = ${name})
         OR EXISTS (SELECT 1 FROM json_each(packages_added) WHERE value = ${name})
         OR EXISTS (SELECT 1 FROM json_each(packages_removed) WHERE value = ${name})
      ORDER BY pushed_at DESC
      LIMIT 20
    `);
    const versionHistory = (historyRows as any[]).map((row) => {
      const updated = row.packages_updated?.[name];
      const added = (row.packages_added ?? []).includes(name);
      const removed = (row.packages_removed ?? []).includes(name);
      return {
        date: row.pushed_at,
        event: updated ? 'updated' : added ? 'added' : 'removed',
        from: updated?.from ?? null,
        to: updated?.to ?? null,
      };
    });

    // Staleness score
    const [stalenessRow] = await db
      .select()
      .from(schema.stalenessScores)
      .where(eq(schema.stalenessScores.packageId, pkg.id))
      .limit(1);

    // Reverse dependency count
    const [revDepResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.dependencyEdges)
      .where(eq(schema.dependencyEdges.dependsOnId, pkg.id));

    return reply.view('pages/package-detail.ejs', {
      title: pkg.name,
      pkg,
      source: source ?? null,
      upstreamReleases,
      cves: cveRows,
      versionHistory,
      activeAdvisories,
      kbDocs,
      flash,
      staleness: stalenessRow ?? null,
      reverseDepCount: Number(revDepResult.count) || 0,
    });
  });

  app.post<{ Params: { name: string } }>('/packages/:name/remove', async (request, reply) => {
    const { name } = request.params;
    await db.delete(schema.packages).where(eq(schema.packages.name, name));
    const userName = request.session.get('user')?.name || 'unknown';
    await logActivity('package_deleted', `Package "${name}" deleted by ${userName}`, { packageName: name, deletedBy: userName });
    return reply.redirect('/');
  });
}
