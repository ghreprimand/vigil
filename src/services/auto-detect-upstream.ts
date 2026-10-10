import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { upstreamMappings } from '../data/upstream-mappings.js';
import { lookupArch } from '../scripts/arch-lookup.js';
import { logger } from '../utils/logger.js';

// Case-insensitive static map: keyed by lowercased package name.
const staticMap = new Map(upstreamMappings.map((m) => [m.package.toLowerCase(), m]));

// Alias layer applied (lowercased) before the static-map lookup. Maps common
// distro-specific package names onto the canonical name used in
// upstream-mappings.ts. Keep this small and obvious.
//   python    -> python3  (LFS/BLFS build "Python-3.x"; some inventories name it "python")
//   gcc-libs  -> gcc      (runtime lib split shares gcc's upstream release stream)
const aliasMap = new Map<string, string>([
  ['python', 'python3'],
  ['gcc-libs', 'gcc'],
]);

/** Resolve a package name to its static upstream mapping, case-insensitively and via aliases. */
function lookupMapping(name: string) {
  const lower = name.toLowerCase();
  const resolved = aliasMap.get(lower) ?? lower;
  return staticMap.get(resolved);
}

/**
 * Auto-detect and seed upstream sources for newly added packages.
 * Called after manifest push inserts new packages.
 * Runs async (fire-and-forget) so it doesn't block the manifest response.
 */
export async function autoDetectUpstream(newPackageNames: string[]): Promise<void> {
  if (newPackageNames.length === 0) return;

  let seeded = 0;
  let updated = 0;

  for (const name of newPackageNames) {
    try {
      // Look up the package ID
      const [pkg] = await db
        .select({ id: schema.packages.id })
        .from(schema.packages)
        .where(eq(schema.packages.name, name))
        .limit(1);

      if (!pkg) continue;

      // Check if already has an upstream source
      const [existing] = await db
        .select({
          id: schema.upstreamSources.id,
          sourceType: schema.upstreamSources.sourceType,
          config: schema.upstreamSources.config,
        })
        .from(schema.upstreamSources)
        .where(eq(schema.upstreamSources.packageId, pkg.id))
        .limit(1);

      // If a row already exists, only update it when the static mapping
      // diverges from the stored config (handles `upstream-mappings.ts`
      // edits like new tag_pattern filters that were added after seed).
      if (existing) {
        const staticMatch = lookupMapping(name);
        if (
          staticMatch &&
          (existing.sourceType !== staticMatch.source_type ||
            JSON.stringify(existing.config) !== JSON.stringify(staticMatch.config))
        ) {
          await db
            .update(schema.upstreamSources)
            .set({
              sourceType: staticMatch.source_type,
              config: staticMatch.config,
            })
            .where(eq(schema.upstreamSources.id, existing.id));
          updated++;
        }
        continue;
      }

      // Tier 1: Static mapping (new row)
      const staticMatch = lookupMapping(name);
      if (staticMatch) {
        await db.insert(schema.upstreamSources).values({
          packageId: pkg.id,
          sourceType: staticMatch.source_type,
          config: staticMatch.config,
        });
        seeded++;
        continue;
      }

      // Tier 2: Arch Linux API lookup
      try {
        const archResult = await lookupArch(name);
        if (archResult) {
          await db.insert(schema.upstreamSources).values({
            packageId: pkg.id,
            sourceType: archResult.source_type,
            config: archResult.config,
          });
          seeded++;
          await sleep(200);
          continue;
        }
      } catch (err) {
        logger.warn({ err, packageName: name }, 'Arch API lookup failed');
      }
    } catch (err) {
      logger.error({ err, package: name }, 'Auto-detect upstream failed for package');
    }
  }

  if (seeded > 0 || updated > 0) {
    logger.info({ seeded, updated, total: newPackageNames.length }, 'Auto-detected upstream sources');
  }
}

/**
 * Reseed static upstream mappings against ALL existing packages.
 * Used on server startup to apply any edits to `upstream-mappings.ts`
 * (new packages, refined tag_pattern, source_type swap) to existing rows
 * without requiring manual SQL or a full re-import.
 */
export async function reseedStaticMappings(): Promise<void> {
  // Use the original mapping package names (they match real package rows).
  const allMappingNames = upstreamMappings.map((m) => m.package);
  await autoDetectUpstream(allMappingNames);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
