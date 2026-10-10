import { db, schema } from '../db/index.js';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { autoDetectUpstream } from './auto-detect-upstream.js';
import { compareVersions } from './version-compare.js';
import { recalculateStaleness, recalculateIsNewer } from './staleness.js';
import { sendUnmappedPackagesAlert } from './notifications.js';

// Server-side groups (like "toolchain") are preserved across manifest pushes.
// Client groups from pacman are merged in, deduped.
function mergeGroups(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming]);
  return [...set];
}

/**
 * Normalize a package version to its upstream form by stripping any
 * distribution epoch prefix and release suffix.
 *
 * Tolerant of several common conventions:
 *   "1:6.6.1-2"   -> "6.6.1"   (epoch + pkgrel)
 *   "1.88.127-1"  -> "1.88.127" (pkgrel)
 *   "6.10.2-arch1" -> "6.10.2"  (named pkgrel)
 *   "6.10.2"      -> "6.10.2"   (plain upstream version, unchanged)
 */
export function normalizeVersion(v: string): string {
  const trimmed = v.trim();
  // Strip a leading numeric epoch (e.g. "1:2.3.4" -> "2.3.4").
  const noEpoch = trimmed.replace(/^\d+:/, '');
  // Strip a trailing release suffix: "-2", "-arch1", "-1.1", etc. We only
  // remove the final dash-delimited segment when it looks like a release tag
  // (starts with a digit or a short alpha tag), leaving plain upstream
  // versions such as "6.10.2" untouched.
  return noEpoch.replace(/-(?:\d[\w.]*|[A-Za-z]+\d[\w.]*)$/, '');
}

export interface ManifestPackage {
  name: string;
  version: string;
  description?: string;
  depends?: string[];
  provides?: string[];
  groups?: string[];
  architecture?: string;
  build_date?: string;
  install_date?: string;
}

export interface ManifestPayload {
  packages: ManifestPackage[];
}

export interface ManifestDiff {
  added: string[];
  removed: string[];
  updated: Record<string, { from: string; to: string }>;
  unchanged: number;
}

export async function processManifest(
  payload: ManifestPayload,
  sourceIp: string | undefined,
): Promise<{ diff: ManifestDiff; pushId: number }> {
  const incoming = new Map(payload.packages.map((p) => [p.name, p]));

  // Get all existing packages
  const existing = await db.select().from(schema.packages);
  const existingMap = new Map(existing.map((p) => [p.name, p]));

  const diff: ManifestDiff = {
    added: [],
    removed: [],
    updated: {},
    unchanged: 0,
  };

  const now = new Date();

  // Upsert incoming packages
  for (const [name, pkg] of incoming) {
    const ex = existingMap.get(name);
    if (!ex) {
      diff.added.push(name);
      const cleanVersion = normalizeVersion(pkg.version);
      await db.insert(schema.packages).values({
        name: pkg.name,
        version: cleanVersion,
        description: pkg.description ?? '',
        architecture: pkg.architecture ?? 'x86_64',
        depends: pkg.depends ?? [],
        provides: pkg.provides ?? [],
        groups: pkg.groups ?? [],
        buildDate: pkg.build_date ? new Date(pkg.build_date) : null,
        installDate: pkg.install_date ? new Date(pkg.install_date) : null,
        firstSeen: now,
        lastSeen: now,
      });
    } else {
      const cleanVersion = normalizeVersion(pkg.version);
      if (ex.version !== cleanVersion) {
        diff.updated[name] = { from: ex.version, to: cleanVersion };
      } else {
        diff.unchanged++;
      }
      await db
        .update(schema.packages)
        .set({
          version: cleanVersion,
          description: pkg.description ?? ex.description,
          architecture: pkg.architecture ?? ex.architecture,
          depends: pkg.depends ?? ex.depends,
          provides: pkg.provides ?? ex.provides,
          groups: mergeGroups(ex.groups as string[] ?? [], pkg.groups ?? []),
          buildDate: pkg.build_date ? new Date(pkg.build_date) : ex.buildDate,
          installDate: pkg.install_date ? new Date(pkg.install_date) : ex.installDate,
          lastSeen: now,
        })
        .where(eq(schema.packages.name, name));
    }
  }

  // Packages absent from the manifest are tracked in the diff for auditing
  // but are NOT deleted here. Deletion is handled exclusively by the targeted
  // DELETE /api/v1/packages/:name endpoint, triggered per-package by the
  // producer (for example a package-manager removal hook). This prevents bulk accidental deletions from partial
  // or malformed manifests.
  for (const [name] of existingMap) {
    if (!incoming.has(name)) {
      diff.removed.push(name);
    }
  }

  // Rebuild dependency edges
  await rebuildDependencyEdges(payload.packages);

  // Record the push
  const [push] = await db
    .insert(schema.manifestPushes)
    .values({
      pushedAt: now,
      sourceIp: sourceIp ?? null,
      packageCount: payload.packages.length,
      packagesAdded: diff.added,
      packagesRemoved: diff.removed,
      packagesUpdated: diff.updated,
      rawManifest: payload,
    })
    .returning({ id: schema.manifestPushes.id });

  logger.info(
    {
      pushId: push.id,
      added: diff.added.length,
      removed: diff.removed.length,
      updated: Object.keys(diff.updated).length,
      unchanged: diff.unchanged,
    },
    'Manifest processed',
  );

  // Background tasks: auto-detect upstream sources for new packages, then alert
  // on any that still have no source after both detection tiers have run.
  // Each step has independent error handling so a detection failure doesn't
  // silently suppress the unmapped-package alert.
  if (diff.added.length > 0) {
    (async () => {
      try {
        await autoDetectUpstream(diff.added);
      } catch (err) {
        logger.error({ err }, 'Auto-detect upstream failed');
      }
      try {
        await alertUnmappedPackages(diff.added);
      } catch (err) {
        logger.error({ err }, 'Unmapped package alert failed');
      }
    })().catch((err) => {
      logger.error({ err }, 'Unhandled error in new-package background tasks');
    });
  }

  // Recalculate isNewer flags, staleness scores, and CVE applicability for updated packages.
  // IMPORTANT: staleness must run AFTER isNewer completes, otherwise it reads stale
  // is_newer flags and computes incorrect scores that never get cleaned up.
  const updatedNames = Object.keys(diff.updated);
  if (updatedNames.length > 0) {
    (async () => {
      try {
        await recalculateIsNewer(updatedNames);
      } catch (err) {
        logger.error({ err }, 'isNewer recalculation failed');
      }
      try {
        await recalculateStaleness(updatedNames);
      } catch (err) {
        logger.error({ err }, 'Staleness recalculation failed');
      }
    })().catch((err) => {
      logger.error({ err }, 'Unhandled error in update recalculation tasks');
    });

    recalcCveApplicability(diff.updated).catch((err) => {
      logger.error({ err }, 'CVE applicability recalculation failed');
    });
  }

  return { diff, pushId: push.id };
}

function rebuildDependencyEdges(packages: ManifestPackage[]) {
  // better-sqlite3 transactions are synchronous - the callback must not return
  // a promise, so all tx operations execute eagerly via .run()/.all().
  db.transaction((tx) => {
    // Clear existing edges
    tx.delete(schema.dependencyEdges).run();

    // Build lookup of package names to IDs
    const allPkgs = tx.select({ id: schema.packages.id, name: schema.packages.name }).from(schema.packages).all();
    const nameToId = new Map(allPkgs.map((p) => [p.name, p.id]));

    const edges: { packageId: number; dependsOnId: number; dependencyType: string }[] = [];

    for (const pkg of packages) {
      const pkgId = nameToId.get(pkg.name);
      if (!pkgId || !pkg.depends) continue;

      for (const depName of pkg.depends) {
        // Strip version constraints (e.g., "qt6>=6.7" -> "qt6")
        const cleanName = depName.replace(/[><=!].*$/, '').trim();
        const depId = nameToId.get(cleanName);
        if (depId) {
          edges.push({ packageId: pkgId, dependsOnId: depId, dependencyType: 'runtime' });
        }
      }
    }

    if (edges.length > 0) {
      // Batch insert in chunks
      const chunkSize = 500;
      for (let i = 0; i < edges.length; i += chunkSize) {
        const chunk = edges.slice(i, i + chunkSize);
        tx.insert(schema.dependencyEdges).values(chunk).onConflictDoNothing().run();
      }
    }

    logger.info({ edgeCount: edges.length }, 'Dependency edges rebuilt');
  });
}

/**
 * After auto-detection has run, find which of the newly added packages still
 * have no upstream source and send a one-time email alert for them.
 */
async function alertUnmappedPackages(addedNames: string[]): Promise<void> {
  if (addedNames.length === 0) return;

  const unmapped = await db
    .select({ name: schema.packages.name })
    .from(schema.packages)
    .where(
      and(
        inArray(schema.packages.name, addedNames),
        sql`${schema.packages.id} NOT IN (
          SELECT DISTINCT ${schema.upstreamSources.packageId}
          FROM ${schema.upstreamSources}
        )`,
      ),
    );

  if (unmapped.length > 0) {
    await sendUnmappedPackagesAlert(unmapped.map((p) => p.name));
  }
}

/**
 * After a manifest push updates package versions, remove CVE links where the
 * installed version is now at or above the CVE's fixedVersion. Only removes
 * the package->CVE link; the CVE record itself is left untouched so it remains
 * visible in the security view if other packages are still affected.
 */
async function recalcCveApplicability(
  updated: Record<string, { from: string; to: string }>,
): Promise<void> {
  const names = Object.keys(updated);
  const pkgs = await db
    .select({ id: schema.packages.id, name: schema.packages.name, version: schema.packages.version })
    .from(schema.packages)
    .where(inArray(schema.packages.name, names));

  let resolved = 0;
  for (const pkg of pkgs) {
    const linkedCves = await db
      .select({
        pvId: schema.packageVulnerabilities.id,
        cveId: schema.vulnerabilities.cveId,
        fixedVersion: schema.vulnerabilities.fixedVersion,
        affectedEndExcluding: schema.packageVulnerabilities.affectedEndExcluding,
        affectedEndIncluding: schema.packageVulnerabilities.affectedEndIncluding,
      })
      .from(schema.packageVulnerabilities)
      .innerJoin(
        schema.vulnerabilities,
        eq(schema.packageVulnerabilities.vulnerabilityId, schema.vulnerabilities.id),
      )
      .where(
        and(
          eq(schema.packageVulnerabilities.packageId, pkg.id),
          eq(schema.vulnerabilities.status, 'open'),
        ),
      );

    for (const cve of linkedCves) {
      let shouldResolve = false;
      if (cve.affectedEndExcluding && compareVersions(pkg.version, cve.affectedEndExcluding) >= 0) {
        shouldResolve = true;
      } else if (cve.affectedEndIncluding && compareVersions(pkg.version, cve.affectedEndIncluding) > 0) {
        shouldResolve = true;
      } else if (cve.fixedVersion && compareVersions(pkg.version, cve.fixedVersion) >= 0) {
        shouldResolve = true;
      }
      if (shouldResolve) {
        const fixRef = cve.affectedEndExcluding ?? cve.affectedEndIncluding ?? cve.fixedVersion;
        await db
          .delete(schema.packageVulnerabilities)
          .where(eq(schema.packageVulnerabilities.id, cve.pvId));
        resolved++;
        logger.info(
          { packageName: pkg.name, version: pkg.version, cveId: cve.cveId, fixedVersion: fixRef },
          'CVE link auto-removed: package updated past fixed version',
        );
      }
    }
  }

  if (resolved > 0) {
    logger.info({ resolved }, 'CVE applicability recalculated after manifest push');
    await autoResolveOrphanedCves();
  }
}

/**
 * Find all open CVEs with zero remaining package_vulnerabilities rows
 * and transition them to status='fixed'. Never touches dismissed CVEs.
 */
export async function autoResolveOrphanedCves(): Promise<number> {
  const orphaned = await db
    .select({ id: schema.vulnerabilities.id, cveId: schema.vulnerabilities.cveId })
    .from(schema.vulnerabilities)
    .where(
      and(
        eq(schema.vulnerabilities.status, 'open'),
        sql`${schema.vulnerabilities.id} NOT IN (
          SELECT DISTINCT ${schema.packageVulnerabilities.vulnerabilityId}
          FROM ${schema.packageVulnerabilities}
        )`,
      ),
    );

  if (orphaned.length === 0) return 0;

  await db
    .update(schema.vulnerabilities)
    .set({ status: 'fixed', updatedAt: new Date() })
    .where(
      inArray(
        schema.vulnerabilities.id,
        orphaned.map((v) => v.id),
      ),
    );

  logger.info(
    { count: orphaned.length, cveIds: orphaned.map((v) => v.cveId) },
    'Auto-resolved orphaned CVEs (open -> fixed)',
  );

  return orphaned.length;
}
