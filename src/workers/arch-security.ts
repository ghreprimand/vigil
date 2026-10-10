import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { compareVersions } from '../services/version-compare.js';
import { logActivity } from '../services/activity.js';
import { sendCveAlerts, getAlertSettings, type CveAlert } from '../services/notifications.js';

const ARCH_SECURITY_URL = 'https://security.archlinux.org/advisory.json';

interface ArchAdvisory {
  name: string;       // e.g., "ASA-202602-1"
  packages: string[]; // e.g., ["openssl"]
  status: string;     // "Vulnerable", "Fixed", "Not affected"
  severity: string;   // "Critical", "High", "Medium", "Low"
  type: string;       // "multiple issues", "arbitrary code execution", etc.
  affected: string;   // affected version
  fixed: string | null; // fixed version
  issues: string[];   // e.g., ["CVE-2026-1234", "CVE-2026-1235"]
  advisories: string[]; // related advisory IDs
}

export async function processArchSecurity(): Promise<void> {
  const response = await fetch(ARCH_SECURITY_URL, {
    headers: { 'User-Agent': brand.userAgent },
  });

  if (!response.ok) {
    throw new Error(`Arch security API error: ${response.status} ${response.statusText}`);
  }

  const advisories = await response.json() as ArchAdvisory[];
  logger.info({ advisoryCount: advisories.length }, 'Arch security checker: fetched advisories');

  // Get all package names for matching
  const allPackages = await db
    .select({ id: schema.packages.id, name: schema.packages.name, version: schema.packages.version })
    .from(schema.packages);
  const packageMap = new Map(allPackages.map((p) => [p.name, p]));

  let newVulns = 0;
  let matchedLinks = 0;
  let autoCleared = 0;
  const highSeverityAlerts: CveAlert[] = [];

  for (const advisory of advisories) {
    // Process each CVE in the advisory
    for (const cveId of advisory.issues ?? []) {
      if (!cveId.startsWith('CVE-')) continue;

      // Map Arch severity to our format
      const severity = mapSeverity(advisory.severity);
      // Map Arch severity to approximate CVSS score for alert threshold comparison
      const cvssMap: Record<string, number> = { critical: 9.5, high: 8.0, medium: 5.0, low: 2.0 };
      const cvssScore = cvssMap[severity] ?? 5.0;

      // Upsert vulnerability
      const [vuln] = await db
        .insert(schema.vulnerabilities)
        .values({
          cveId,
          title: `${advisory.type} in ${advisory.packages.join(', ')}`,
          description: `Arch Linux Security Advisory ${advisory.name}: ${advisory.type}. Status: ${advisory.status}.`,
          severity,
          source: 'arch',
          sourceUrl: `https://security.archlinux.org/${advisory.name}`,
          fixedVersion: advisory.fixed || null,
          status: advisory.status === 'Fixed' ? 'fixed' : 'open',
        })
        .onConflictDoUpdate({
          target: schema.vulnerabilities.cveId,
          set: {
            fixedVersion: advisory.fixed || null,
            status: advisory.status === 'Fixed' ? 'fixed' : 'open',
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.vulnerabilities.id });

      if (!vuln) continue;

      // Get the effective fixedVersion (may have been enriched by NVD worker)
      const [vulnRecord] = await db
        .select({ fixedVersion: schema.vulnerabilities.fixedVersion })
        .from(schema.vulnerabilities)
        .where(eq(schema.vulnerabilities.id, vuln.id))
        .limit(1);
      const effectiveFixed = advisory.fixed || vulnRecord?.fixedVersion || null;

      // Match advisory packages to our installed packages
      const linkedPackageNames: string[] = [];
      for (const archPkgName of advisory.packages) {
        // Direct match
        const pkg = packageMap.get(archPkgName);
        if (pkg) {
          // Skip if installed version is already at or past the fix
          if (effectiveFixed && compareVersions(pkg.version, effectiveFixed) >= 0) {
            autoCleared++;
            await logActivity('cve_auto_cleared', `${cveId} auto-cleared: ${pkg.name} ${pkg.version} already at or past fix version ${effectiveFixed}`, {
              cveId, package: pkg.name, installedVersion: pkg.version, fixedVersion: effectiveFixed,
            });
            continue;
          }
          await db
            .insert(schema.packageVulnerabilities)
            .values({
              packageId: pkg.id,
              vulnerabilityId: vuln.id,
              matchConfidence: 'exact',
            })
            .onConflictDoNothing();
          matchedLinks++;
          linkedPackageNames.push(pkg.name);
        }
        // A custom-named kernel package differs from Arch "linux" naming -- try fuzzy.
        // e.g., Arch "linux" -> configured kernel package name.
        if (archPkgName === 'linux' && brand.kernelPackage !== 'linux') {
          const kernelPkg = packageMap.get(brand.kernelPackage);
          if (kernelPkg) {
            if (effectiveFixed && compareVersions(kernelPkg.version, effectiveFixed) >= 0) {
              autoCleared++;
              await logActivity('cve_auto_cleared', `${cveId} auto-cleared: ${kernelPkg.name} ${kernelPkg.version} already at or past fix version ${effectiveFixed}`, {
                cveId, package: kernelPkg.name, installedVersion: kernelPkg.version, fixedVersion: effectiveFixed,
              });
              continue;
            }
            await db
              .insert(schema.packageVulnerabilities)
              .values({
                packageId: kernelPkg.id,
                vulnerabilityId: vuln.id,
                matchConfidence: 'fuzzy',
              })
              .onConflictDoNothing();
            matchedLinks++;
            linkedPackageNames.push(kernelPkg.name);
          }
        }
      }

      // Queue alert for threshold check below
      if (linkedPackageNames.length > 0 && cvssScore > 0) {
        highSeverityAlerts.push({
          cveId,
          cvssScore,
          severity,
          title: `${advisory.type} in ${advisory.packages.join(', ')}`,
          packageNames: linkedPackageNames,
        });
      }

      newVulns++;
    }
  }

  // Filter alerts by user-configured CVSS threshold before sending
  if (highSeverityAlerts.length > 0) {
    const alertSettings = await getAlertSettings();
    const cvssThreshold = alertSettings.cveMinCvss ?? 7.0;
    const filteredAlerts = highSeverityAlerts.filter((a) => (a.cvssScore ?? 0) >= cvssThreshold);
    if (filteredAlerts.length > 0) {
      await sendCveAlerts(filteredAlerts);
    }
  }

  logger.info({ processedAdvisories: advisories.length, newVulns, matchedLinks, autoCleared, alerts: highSeverityAlerts.length }, 'Arch security checker: done');
}

function mapSeverity(archSeverity: string): string {
  switch (archSeverity.toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'medium';
  }
}
