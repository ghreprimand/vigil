import { db, schema } from '../db/index.js';
import { eq, sql, and, inArray, desc, asc, gte } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

export interface BatchSummary {
  id: number;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  totalItems: number;
  completedItems: number;
}

export interface BatchItemDetail {
  id: number;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  buildOrder: number;
  status: string;
  score: number | null;
  cveCount: number;
}

export interface BatchDetail extends BatchSummary {
  items: BatchItemDetail[];
}

/**
 * Topological sort using Kahn's algorithm (same logic as rebuild-plan route).
 */
function topologicalSort(
  nodes: string[],
  edges: Map<string, Set<string>>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjReverse = new Map<string, Set<string>>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjReverse.set(node, new Set());
  }

  for (const node of nodes) {
    const deps = edges.get(node) ?? new Set();
    for (const dep of deps) {
      if (!inDegree.has(dep)) continue;
      inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      adjReverse.get(dep)!.add(node);
    }
  }

  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }
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

  // Append any remaining (cycle members) at the end
  for (const node of nodes) {
    if (!order.includes(node)) order.push(node);
  }

  return order;
}

/**
 * Resolve topological build order for a set of package names.
 */
async function resolveBuildOrder(packageNames: string[]): Promise<string[]> {
  const pkgRows = await db
    .select({ id: schema.packages.id, name: schema.packages.name })
    .from(schema.packages)
    .where(inArray(schema.packages.name, packageNames));

  const foundIds = pkgRows.map((r) => r.id);
  const idToName = new Map(pkgRows.map((r) => [r.id, r.name]));

  const edgeRows = await db
    .select({
      packageId: schema.dependencyEdges.packageId,
      dependsOnId: schema.dependencyEdges.dependsOnId,
    })
    .from(schema.dependencyEdges)
    .where(inArray(schema.dependencyEdges.packageId, foundIds));

  const depsMap = new Map<string, Set<string>>();
  for (const row of pkgRows) {
    depsMap.set(row.name, new Set());
  }
  for (const edge of edgeRows) {
    const pkgName = idToName.get(edge.packageId);
    const depName = idToName.get(edge.dependsOnId);
    if (pkgName && depName && depsMap.has(pkgName)) {
      depsMap.get(pkgName)!.add(depName);
    }
  }

  return topologicalSort(pkgRows.map((r) => r.name), depsMap);
}

/**
 * Batch-load the latest upstream versions for multiple packages at once.
 * Returns a map of packageId -> latest version string.
 */
async function getLatestUpstreamBatch(packageIds: number[]): Promise<Map<number, string>> {
  if (packageIds.length === 0) return new Map();

  // Use a window function to get the latest release per package
  const rows = await db
    .select({
      packageId: schema.upstreamReleases.packageId,
      version: schema.upstreamReleases.version,
      releaseDate: schema.upstreamReleases.releaseDate,
    })
    .from(schema.upstreamReleases)
    .where(
      and(
        inArray(schema.upstreamReleases.packageId, packageIds),
        eq(schema.upstreamReleases.isNewer, true),
      ),
    )
    .orderBy(desc(schema.upstreamReleases.releaseDate));

  // Keep only the first (most recent) per packageId
  const result = new Map<number, string>();
  for (const row of rows) {
    if (!result.has(row.packageId)) {
      result.set(row.packageId, row.version);
    }
  }
  return result;
}

/**
 * Create a batch from explicit package names.
 */
export async function createBatch(
  name: string,
  packageNames: string[],
  description?: string,
): Promise<BatchDetail> {
  const order = await resolveBuildOrder(packageNames);

  // Resolve package details
  const pkgRows = await db
    .select({
      id: schema.packages.id,
      name: schema.packages.name,
      version: schema.packages.version,
    })
    .from(schema.packages)
    .where(inArray(schema.packages.name, order));

  const pkgMap = new Map(pkgRows.map((r) => [r.name, r]));

  // Batch-load all latest upstream versions in one query
  const pkgIds = pkgRows.map((r) => r.id);
  const latestVersions = await getLatestUpstreamBatch(pkgIds);

  // Create batch record
  const [batch] = await db
    .insert(schema.updateBatches)
    .values({
      name,
      description: description ?? null,
      status: 'planned',
    })
    .returning();

  // Create batch items in build order
  const items: BatchItemDetail[] = [];
  for (let i = 0; i < order.length; i++) {
    const pkg = pkgMap.get(order[i]);
    if (!pkg) continue;

    const toVersion = latestVersions.get(pkg.id) ?? 'unknown';

    const [item] = await db
      .insert(schema.batchItems)
      .values({
        batchId: batch.id,
        packageId: pkg.id,
        fromVersion: pkg.version,
        toVersion,
        buildOrder: i + 1,
        status: 'pending',
      })
      .returning();

    items.push({
      id: item.id,
      packageName: pkg.name,
      fromVersion: pkg.version,
      toVersion,
      buildOrder: i + 1,
      status: 'pending',
      score: null,
      cveCount: 0,
    });
  }

  logger.info({ batchId: batch.id, name, itemCount: items.length }, 'Batch created');

  return {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    status: batch.status,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
    totalItems: items.length,
    completedItems: 0,
    items,
  };
}

/**
 * Create a batch from staleness scores above a threshold.
 */
export async function createBatchFromScore(
  minScore: number,
  category?: string,
): Promise<BatchDetail> {
  // Find packages with scores >= threshold, joining groups in the same query
  const rows = await db
    .select({
      packageId: schema.stalenessScores.packageId,
      score: schema.stalenessScores.score,
      name: schema.packages.name,
      groups: schema.packages.groups,
    })
    .from(schema.stalenessScores)
    .innerJoin(schema.packages, eq(schema.stalenessScores.packageId, schema.packages.id))
    .where(gte(schema.stalenessScores.score, minScore))
    .orderBy(desc(schema.stalenessScores.score));

  // Filter by category/group if specified - all in memory, no N+1
  let packageNames: string[];
  if (category) {
    packageNames = rows
      .filter((row) => Array.isArray(row.groups) && row.groups.includes(category))
      .map((row) => row.name);
  } else {
    packageNames = rows.map((r) => r.name);
  }

  if (packageNames.length === 0) {
    // Create empty batch
    const [batch] = await db
      .insert(schema.updateBatches)
      .values({
        name: `Auto batch (score >= ${minScore}${category ? `, ${category}` : ''})`,
        description: `Auto-generated batch for packages with staleness score >= ${minScore}`,
        status: 'planned',
      })
      .returning();

    return {
      id: batch.id,
      name: batch.name,
      description: batch.description,
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      totalItems: 0,
      completedItems: 0,
      items: [],
    };
  }

  const tierLabel = minScore >= 25 ? 'Critical' : minScore >= 15 ? 'High' : minScore >= 5 ? 'Medium' : 'All';
  const batchName = `${tierLabel} updates${category ? ` (${category})` : ''} - ${new Date().toISOString().slice(0, 10)}`;

  return createBatch(batchName, packageNames, `Auto-generated: score >= ${minScore}`);
}

/**
 * Mark a single batch item as completed.
 */
export async function updateItemStatus(
  batchId: number,
  packageName: string,
  status: 'pending' | 'completed',
): Promise<boolean> {
  // Find the batch item
  const items = await db
    .select({
      itemId: schema.batchItems.id,
      packageName: schema.packages.name,
    })
    .from(schema.batchItems)
    .innerJoin(schema.packages, eq(schema.batchItems.packageId, schema.packages.id))
    .where(
      and(
        eq(schema.batchItems.batchId, batchId),
        eq(schema.packages.name, packageName),
      ),
    );

  if (items.length === 0) return false;

  await db
    .update(schema.batchItems)
    .set({ status })
    .where(eq(schema.batchItems.id, items[0].itemId));

  // If marking completed, check if all items are done -> auto-complete batch
  if (status === 'completed') {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.batchItems)
      .where(
        and(
          eq(schema.batchItems.batchId, batchId),
          eq(schema.batchItems.status, 'pending'),
        ),
      );

    if (Number(remaining.count) === 0) {
      await db
        .update(schema.updateBatches)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(schema.updateBatches.id, batchId));
      logger.info({ batchId }, 'Batch auto-completed (all items done)');
    } else {
      // Ensure batch is in_progress
      await db
        .update(schema.updateBatches)
        .set({ status: 'in_progress' })
        .where(
          and(
            eq(schema.updateBatches.id, batchId),
            eq(schema.updateBatches.status, 'planned'),
          ),
        );
    }
  }

  return true;
}

/**
 * Mark entire batch as completed.
 */
export async function completeBatch(batchId: number): Promise<boolean> {
  const result = await db
    .update(schema.updateBatches)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(schema.updateBatches.id, batchId))
    .returning();

  if (result.length === 0) return false;

  // Mark all pending items as completed
  await db
    .update(schema.batchItems)
    .set({ status: 'completed' })
    .where(
      and(
        eq(schema.batchItems.batchId, batchId),
        eq(schema.batchItems.status, 'pending'),
      ),
    );

  logger.info({ batchId }, 'Batch manually completed');
  return true;
}

/**
 * Get a single batch with all items.
 */
export async function getBatch(batchId: number): Promise<BatchDetail | null> {
  const [batch] = await db
    .select()
    .from(schema.updateBatches)
    .where(eq(schema.updateBatches.id, batchId));

  if (!batch) return null;

  const items = await db
    .select({
      id: schema.batchItems.id,
      packageName: schema.packages.name,
      fromVersion: schema.batchItems.fromVersion,
      toVersion: schema.batchItems.toVersion,
      buildOrder: schema.batchItems.buildOrder,
      status: schema.batchItems.status,
      score: schema.stalenessScores.score,
    })
    .from(schema.batchItems)
    .innerJoin(schema.packages, eq(schema.batchItems.packageId, schema.packages.id))
    .leftJoin(schema.stalenessScores, eq(schema.batchItems.packageId, schema.stalenessScores.packageId))
    .where(eq(schema.batchItems.batchId, batchId))
    .orderBy(asc(schema.batchItems.buildOrder));

  // Get CVE counts
  const packageIds = await db
    .select({ packageId: schema.batchItems.packageId })
    .from(schema.batchItems)
    .where(eq(schema.batchItems.batchId, batchId));

  const cveCountMap = new Map<string, number>();
  if (packageIds.length > 0) {
    const cveCounts = await db
      .select({
        name: schema.packages.name,
        count: sql<number>`count(*)`,
      })
      .from(schema.packageVulnerabilities)
      .innerJoin(schema.packages, eq(schema.packageVulnerabilities.packageId, schema.packages.id))
      .innerJoin(schema.vulnerabilities, eq(schema.packageVulnerabilities.vulnerabilityId, schema.vulnerabilities.id))
      .where(
        and(
          inArray(schema.packageVulnerabilities.packageId, packageIds.map((r) => r.packageId)),
          eq(schema.vulnerabilities.status, 'open'),
        ),
      )
      .groupBy(schema.packages.name);

    for (const row of cveCounts) {
      cveCountMap.set(row.name, Number(row.count));
    }
  }

  const completedCount = items.filter((i) => i.status === 'completed').length;

  return {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    status: batch.status,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
    totalItems: items.length,
    completedItems: completedCount,
    items: items.map((i) => ({
      id: i.id,
      packageName: i.packageName,
      fromVersion: i.fromVersion,
      toVersion: i.toVersion,
      buildOrder: i.buildOrder,
      status: i.status,
      score: i.score,
      cveCount: cveCountMap.get(i.packageName) ?? 0,
    })),
  };
}

/**
 * List all batches with summary info.
 * Uses a single query with LEFT JOIN and GROUP BY instead of N+1 per-batch count queries.
 */
export async function listBatches(status?: string): Promise<BatchSummary[]> {
  const conditions = status ? [eq(schema.updateBatches.status, status)] : [];

  const rows = await db
    .select({
      id: schema.updateBatches.id,
      name: schema.updateBatches.name,
      description: schema.updateBatches.description,
      status: schema.updateBatches.status,
      createdAt: schema.updateBatches.createdAt,
      completedAt: schema.updateBatches.completedAt,
      totalItems: sql<number>`count(${schema.batchItems.id})`,
      completedItems: sql<number>`count(${schema.batchItems.id}) filter (where ${schema.batchItems.status} = 'completed')`,
    })
    .from(schema.updateBatches)
    .leftJoin(schema.batchItems, eq(schema.batchItems.batchId, schema.updateBatches.id))
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .groupBy(
      schema.updateBatches.id,
      schema.updateBatches.name,
      schema.updateBatches.description,
      schema.updateBatches.status,
      schema.updateBatches.createdAt,
      schema.updateBatches.completedAt,
    )
    .orderBy(desc(schema.updateBatches.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    totalItems: Number(row.totalItems),
    completedItems: Number(row.completedItems),
  }));
}

/**
 * Delete a batch and all its items.
 */
export async function deleteBatch(batchId: number): Promise<boolean> {
  const result = await db
    .delete(schema.updateBatches)
    .where(eq(schema.updateBatches.id, batchId))
    .returning();

  if (result.length > 0) {
    logger.info({ batchId }, 'Batch deleted');
    return true;
  }
  return false;
}

/**
 * Generate markdown for a batch as a copyable checklist.
 */
export function batchToMarkdown(batch: BatchDetail): string {
  const lines: string[] = [];
  lines.push(`# Update Batch: ${batch.name}`);
  lines.push('');
  lines.push(`Status: ${batch.status} | Created: ${batch.createdAt.toISOString().slice(0, 10)}`);
  lines.push(`Progress: ${batch.completedItems}/${batch.totalItems} complete`);
  lines.push('');
  lines.push('## Build Order');
  lines.push('');

  for (const item of batch.items) {
    const check = item.status === 'completed' ? '[x]' : '[ ]';
    const cve = item.cveCount > 0 ? ` ! ${item.cveCount} CVE${item.cveCount > 1 ? 's' : ''}` : '';
    const score = item.score !== null ? ` (score: ${item.score})` : '';
    lines.push(`${item.buildOrder}. ${check} **${item.packageName}** ${item.fromVersion} -> ${item.toVersion}${score}${cve}`);
  }

  return lines.join('\n');
}
