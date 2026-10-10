import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { sql, inArray } from 'drizzle-orm';

interface RebuildPlanBody {
  packages: string[];
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns the sorted order and any detected cycles.
 */
function topologicalSort(
  nodes: string[],
  edges: Map<string, Set<string>>, // node -> set of nodes it depends on
): { order: string[]; cycles: string[] } {
  // In-degree map: how many dependencies each node has (within our subset)
  const inDegree = new Map<string, number>();
  const adjReverse = new Map<string, Set<string>>(); // dependency -> dependents

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjReverse.set(node, new Set());
  }

  // Build adjacency: only consider edges within our node subset
  for (const node of nodes) {
    const deps = edges.get(node) ?? new Set();
    for (const dep of deps) {
      if (!nodes.includes(dep)) continue; // dep not in our set, skip
      inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      adjReverse.get(dep)!.add(node);
    }
  }

  // Kahn's algorithm: start with nodes that have no dependencies in our set
  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }
  // Sort queue for deterministic output (lower-dep packages first)
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    const dependents = adjReverse.get(node) ?? new Set();
    for (const dep of [...dependents].sort()) {
      const newDeg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  // Any remaining nodes with non-zero in-degree are in a cycle
  const cycles = nodes.filter((n) => !order.includes(n));

  return { order, cycles };
}

export async function rebuildPlanRoutes(app: FastifyInstance) {
  app.post<{ Body: RebuildPlanBody }>(
    '/api/v1/rebuild-plan',
    {
      preHandler: [app.verifyHmac],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { packages: requestedNames } = request.body ?? {};

      if (!Array.isArray(requestedNames) || requestedNames.length === 0) {
        return reply.status(400).send({ error: 'packages array is required' });
      }

      const names = [...new Set(requestedNames.map((n) => String(n).trim()).filter(Boolean))];
      if (names.length > 200) {
        return reply.status(400).send({ error: 'Too many packages (max 200)' });
      }

      // Resolve package IDs for requested names
      const pkgRows = await db
        .select({ id: schema.packages.id, name: schema.packages.name })
        .from(schema.packages)
        .where(inArray(schema.packages.name, names));

      const pkgIdMap = new Map(pkgRows.map((r) => [r.name, r.id]));
      const foundNames = pkgRows.map((r) => r.name);
      const notFound = names.filter((n) => !pkgIdMap.has(n));

      if (foundNames.length === 0) {
        return reply.send({
          order: [],
          affected: {},
          warnings: { cycles: [], not_found: notFound },
        });
      }

      const foundIds = pkgRows.map((r) => r.id);

      // Fetch all dependency edges for found packages
      const edgeRows = await db
        .select({
          packageId: schema.dependencyEdges.packageId,
          dependsOnId: schema.dependencyEdges.dependsOnId,
        })
        .from(schema.dependencyEdges)
        .where(inArray(schema.dependencyEdges.packageId, foundIds));

      // Build ID->name map for found packages
      const idToName = new Map(pkgRows.map((r) => [r.id, r.name]));

      // Build name->deps map (only within our requested set)
      const depsMap = new Map<string, Set<string>>();
      for (const name of foundNames) {
        depsMap.set(name, new Set());
      }
      for (const edge of edgeRows) {
        const pkgName = idToName.get(edge.packageId);
        const depName = idToName.get(edge.dependsOnId);
        if (pkgName && depName && depsMap.has(pkgName)) {
          depsMap.get(pkgName)!.add(depName);
        }
      }

      // Topological sort
      const { order, cycles } = topologicalSort(foundNames, depsMap);

      // Compute reverse-dep counts (within found set) for each package
      const revDepCounts = new Map<string, string[]>();
      for (const name of foundNames) {
        revDepCounts.set(name, []);
      }
      for (const [pkg, deps] of depsMap) {
        for (const dep of deps) {
          if (revDepCounts.has(dep)) {
            revDepCounts.get(dep)!.push(pkg);
          }
        }
      }

      // Build affected map: for each package, which other requested packages depend on it
      const affected: Record<string, string[]> = {};
      for (const [pkg, revDeps] of revDepCounts) {
        if (revDeps.length > 0) {
          affected[pkg] = revDeps;
        }
      }

      return reply.send({
        order,
        affected,
        warnings: {
          cycles,
          not_found: notFound,
        },
      });
    },
  );
}
