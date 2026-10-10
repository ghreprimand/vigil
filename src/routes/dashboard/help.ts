import { FastifyInstance } from 'fastify';
import { readFile } from 'fs/promises';
import { db, schema } from '../../db/index.js';
import { sql, eq, desc } from 'drizzle-orm';
import { config } from '../../config.js';

const CONTEXT_FILE = config.helpContextFile;

export async function helpRoutes(app: FastifyInstance) {
  app.get('/help', async (_request, reply) => {
    let contextContent: string | null = null;
    try {
      contextContent = await readFile(CONTEXT_FILE, 'utf-8');
    } catch {
      // file not present - show placeholder
    }
    return reply.view('pages/help.ejs', {
      title: 'Help',
      contextContent,
    });
  });

  // Serve the AI agent context file content (for copy-paste)
  app.get('/help/context', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    try {
      const content = await readFile(CONTEXT_FILE, 'utf-8');
      return reply.send(content);
    } catch {
      return reply.code(404).send('Context file not found.');
    }
  });

  // JSON endpoint for the prompt generator - returns live data from DB
  app.get('/help/prompt-data', async (request, reply) => {
    const { type, min_score, severity, package: pkgName } = request.query as {
      type?: string;
      min_score?: string;
      severity?: string;
      package?: string;
    };

    if (type === 'updates') {
      const minScore = parseFloat(min_score || '0') || 0;
      const conditions = [
        sql`ss.score >= ${minScore}`,
        sql`p.pinned_at IS NULL`,
        sql`p.deferred_at IS NULL`,
      ];
      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      const [countResult] = await db.execute(sql`
        SELECT count(*) AS total
        FROM staleness_scores ss
        JOIN packages p ON ss.package_id = p.id
        ${whereClause}
      `);
      const total = Number((countResult as any).total) || 0;

      const rows = await db.execute(sql`
        SELECT
          p.name,
          p.version AS installed_version,
          ss.score,
          (SELECT version FROM upstream_releases
             WHERE package_id = p.id AND is_newer = true
             ORDER BY release_date DESC NULLS LAST, ver_key(version) DESC, discovered_at DESC
             LIMIT 1) AS upstream_version,
          (SELECT release_url FROM upstream_releases
             WHERE package_id = p.id AND is_newer = true
             ORDER BY release_date DESC NULLS LAST, ver_key(version) DESC, discovered_at DESC
             LIMIT 1) AS upstream_url,
          (SELECT count(*) FROM package_vulnerabilities pv
             JOIN vulnerabilities v ON pv.vulnerability_id = v.id
             WHERE pv.package_id = p.id AND v.status = 'open') AS open_cves
        FROM staleness_scores ss
        JOIN packages p ON ss.package_id = p.id
        ${whereClause}
        ORDER BY ss.score DESC
        LIMIT 200
      `);

      const updates = rows.map((row: any) => ({
        name: row.name,
        installed: row.installed_version,
        upstream: row.upstream_version,
        score: Number(row.score),
        cves: Number(row.open_cves),
        url: row.upstream_url || null,
      }));

      return reply.send({ updates, total });

    } else if (type === 'cves') {
      const conditions = [
        sql`EXISTS (SELECT 1 FROM package_vulnerabilities pv WHERE pv.vulnerability_id = v.id)`,
        sql`v.status = 'open'`,
        sql`EXISTS (
          SELECT 1
          FROM package_vulnerabilities pv
          WHERE pv.vulnerability_id = v.id
            AND pv.needs_triage = FALSE
            AND pv.match_confidence <> 'fuzzy'
        )`,
        sql`(
          v.fixed_version IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM package_vulnerabilities pv
            WHERE pv.vulnerability_id = v.id
              AND pv.needs_triage = FALSE
              AND pv.match_confidence <> 'fuzzy'
              AND pv.affected_end_excluding IS NOT NULL
          )
        )`,
      ];

      if (severity === 'critical') {
        conditions.push(sql`v.severity = 'critical'`);
      } else if (severity === 'high') {
        conditions.push(sql`v.severity IN ('critical', 'high')`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // If filtering by package, add a join condition
      let pkgJoin = sql``;
      if (pkgName) {
        pkgJoin = sql`
          JOIN package_vulnerabilities pv2 ON pv2.vulnerability_id = v.id
          JOIN packages p2 ON pv2.package_id = p2.id AND p2.name = ${pkgName}
        `;
      }

      const rows = await db.execute(sql`
        SELECT DISTINCT
          v.cve_id,
          v.severity,
          v.cvss_score,
          v.fixed_version
        FROM vulnerabilities v
        ${pkgJoin}
        ${whereClause}
        ORDER BY v.cvss_score DESC NULLS LAST
        LIMIT 200
      `);

      // Attach package names for each CVE
      const cveIds = rows.map((r: any) => r.cve_id);
      let pkgMap = new Map<string, { name: string; version: string }[]>();

      if (cveIds.length > 0) {
        const pkgLinks = await db.execute(sql`
          SELECT v.cve_id, p.name, p.version
          FROM package_vulnerabilities pv
          JOIN vulnerabilities v ON pv.vulnerability_id = v.id
          JOIN packages p ON pv.package_id = p.id
          WHERE v.cve_id IN (${sql.join(cveIds.map((id: any) => sql`${id}`), sql`, `)})
            AND pv.needs_triage = FALSE
            AND pv.match_confidence <> 'fuzzy'
        `);

        for (const link of pkgLinks as any[]) {
          const arr = pkgMap.get(link.cve_id) ?? [];
          arr.push({ name: link.name, version: link.version });
          pkgMap.set(link.cve_id, arr);
        }
      }

      const cves = rows.map((row: any) => {
        const pkgs = pkgMap.get(row.cve_id) ?? [];
        return {
          id: row.cve_id,
          severity: (row.severity || 'unknown').toUpperCase(),
          cvss: row.cvss_score != null ? Number(row.cvss_score) : null,
          package: pkgs[0]?.name || 'unknown',
          installed: pkgs[0]?.version || 'unknown',
          fixed: row.fixed_version || null,
          allPackages: pkgs.map((p) => p.name),
        };
      });

      return reply.send({ cves, total: cves.length });

    } else if (type === 'package') {
      if (!pkgName) {
        return reply.code(400).send({ error: 'name parameter required' });
      }

      const [pkg] = await db
        .select({
          name: schema.packages.name,
          version: schema.packages.version,
          groups: schema.packages.groups,
        })
        .from(schema.packages)
        .where(eq(schema.packages.name, pkgName))
        .limit(1);

      if (!pkg) {
        return reply.code(404).send({ error: 'Package not found' });
      }

      // Get upstream version
      const [upstream] = await db.execute(sql`
        SELECT version AS upstream_version, release_url
        FROM upstream_releases
        WHERE package_id = (SELECT id FROM packages WHERE name = ${pkgName})
          AND is_newer = true
        ORDER BY release_date DESC NULLS LAST, ver_key(version) DESC, discovered_at DESC
        LIMIT 1
      `) as any[];

      // Get staleness score
      const [score] = await db.execute(sql`
        SELECT score FROM staleness_scores
        WHERE package_id = (SELECT id FROM packages WHERE name = ${pkgName})
      `) as any[];

      // Get open CVE count
      const [cveCount] = await db.execute(sql`
        SELECT count(*) AS cnt
        FROM package_vulnerabilities pv
        JOIN vulnerabilities v ON pv.vulnerability_id = v.id
        WHERE pv.package_id = (SELECT id FROM packages WHERE name = ${pkgName})
          AND v.status = 'open'
      `) as any[];

      return reply.send({
        name: pkg.name,
        installed: pkg.version,
        upstream: upstream?.upstream_version || null,
        groups: pkg.groups ?? [],
        score: score?.score != null ? Number(score.score) : null,
        cves: Number(cveCount?.cnt) || 0,
        url: upstream?.release_url || null,
      });

    } else {
      return reply.code(400).send({ error: 'type parameter required (updates, cves, or package)' });
    }
  });
}
