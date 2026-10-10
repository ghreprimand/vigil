import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { eq, sql } from 'drizzle-orm';

export async function graphRoutes(app: FastifyInstance) {
  // Graph page (optionally pre-select a package via ?pkg=name)
  app.get('/graph', async (request, reply) => {
    const { pkg: preselect } = request.query as { pkg?: string };
    return reply.view('pages/graph.ejs', { title: 'Dependency Graph', preselect: preselect || '' });
  });

  // Package name autocomplete for graph search
  app.get('/api/graph/suggest', async (request, reply) => {
    const { q = '' } = request.query as { q?: string };
    if (q.length < 1) return reply.send([]);
    const results = await db
      .select({ name: schema.packages.name })
      .from(schema.packages)
      .where(sql`${schema.packages.name} LIKE ${`%${q}%`}`)
      .orderBy(sql`CASE WHEN ${schema.packages.name} LIKE ${`${q}%`} THEN 0 ELSE 1 END, ${schema.packages.name}`)
      .limit(15);
    return reply.send(results.map(r => r.name));
  });

  // API: get graph data for a package (dependencies + reverse deps, configurable depth)
  app.get<{ Params: { name: string } }>('/api/graph/:name', async (request, reply) => {
    const { name } = request.params;
    const { depth: depthStr } = request.query as { depth?: string };
    const maxDepth = Math.min(Math.max(parseInt(depthStr || '2') || 2, 1), 3);

    const [pkg] = await db
      .select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages)
      .where(eq(schema.packages.name, name))
      .limit(1);

    if (!pkg) return reply.status(404).send({ error: 'Package not found' });

    // Get all packages and edges in one go (for traversal)
    const allPkgs = await db
      .select({ id: schema.packages.id, name: schema.packages.name })
      .from(schema.packages);
    const idToName = new Map(allPkgs.map(p => [p.id, p.name]));
    const nameToId = new Map(allPkgs.map(p => [p.name, p.id]));

    const allEdges = await db
      .select({
        packageId: schema.dependencyEdges.packageId,
        dependsOnId: schema.dependencyEdges.dependsOnId,
      })
      .from(schema.dependencyEdges);

    // Build adjacency maps
    const deps = new Map<number, number[]>(); // package -> its dependencies
    const revDeps = new Map<number, number[]>(); // package -> who depends on it
    for (const e of allEdges) {
      if (!deps.has(e.packageId)) deps.set(e.packageId, []);
      deps.get(e.packageId)!.push(e.dependsOnId);
      if (!revDeps.has(e.dependsOnId)) revDeps.set(e.dependsOnId, []);
      revDeps.get(e.dependsOnId)!.push(e.packageId);
    }

    // Get staleness scores for outdated highlighting
    const stalenessRows = await db
      .select({ packageId: schema.stalenessScores.packageId, score: schema.stalenessScores.score })
      .from(schema.stalenessScores);
    const stalenessMap = new Map(stalenessRows.map(r => [r.packageId, r.score]));

    // BFS with configurable depth
    const visited = new Set<number>();
    const nodes: { id: string; group: string; outdated?: boolean; score?: number }[] = [];
    const links: { source: string; target: string }[] = [];

    visited.add(pkg.id);
    const rootScore = stalenessMap.get(pkg.id);
    nodes.push({ id: pkg.name, group: 'root', outdated: !!rootScore, score: rootScore ?? 0 });

    // BFS forward deps
    let frontier = [pkg.id];
    for (let level = 1; level <= maxDepth; level++) {
      const nextFrontier: number[] = [];
      const group = level === 1 ? 'dep' : 'dep2';
      for (const nodeId of frontier) {
        const nodeName = idToName.get(nodeId)!;
        for (const depId of (deps.get(nodeId) ?? [])) {
          const depName = idToName.get(depId);
          if (!depName) continue;
          if (!visited.has(depId)) {
            visited.add(depId);
            const s = stalenessMap.get(depId);
            nodes.push({ id: depName, group, outdated: !!s, score: s ?? 0 });
            nextFrontier.push(depId);
          }
          links.push({ source: nodeName, target: depName });
        }
      }
      frontier = nextFrontier;
    }

    // BFS reverse deps
    const level1Deps = deps.get(pkg.id) ?? [];
    const level1RevDeps = revDeps.get(pkg.id) ?? [];
    frontier = [pkg.id];
    for (let level = 1; level <= maxDepth; level++) {
      const nextFrontier: number[] = [];
      const group = level === 1 ? 'revdep' : 'revdep2';
      for (const nodeId of frontier) {
        const nodeName = idToName.get(nodeId)!;
        for (const rdId of (revDeps.get(nodeId) ?? [])) {
          const rdName = idToName.get(rdId);
          if (!rdName) continue;
          if (!visited.has(rdId)) {
            visited.add(rdId);
            const s = stalenessMap.get(rdId);
            nodes.push({ id: rdName, group, outdated: !!s, score: s ?? 0 });
            nextFrontier.push(rdId);
          }
          links.push({ source: rdName, target: nodeName });
        }
      }
      frontier = nextFrontier;
    }

    return reply.send({
      nodes,
      links,
      stats: {
        directDeps: level1Deps.length,
        directRevDeps: level1RevDeps.length,
        totalNodes: nodes.length,
        totalLinks: links.length,
      },
    });
  });
}
