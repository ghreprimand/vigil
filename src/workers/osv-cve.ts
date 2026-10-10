import { db, schema } from '../db/index.js';
import { brand } from '../config.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import {
  loadPackageMap,
  linkVulnToPackages,
  getReverseAliases,
  evaluateOsvRanges,
  isLanguageEcosystem,
  isSystemEcosystem,
  type PackageMatch,
  type OsvRange,
} from '../services/cve-matcher.js';
import { sendCveAlerts, getAlertSettings } from '../services/notifications.js';
import { autoResolveOrphanedCves } from '../services/manifest.js';

const OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns';
const BATCH_SIZE = 500;

interface OsvQueryBatchResponse {
  results: { vulns?: { id: string }[] }[];
}

interface OsvAffected {
  package?: { name: string; ecosystem: string; purl?: string };
  ranges?: OsvRange[];
  versions?: string[];
}

interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  severity?: { type: string; score: string }[];
  affected?: OsvAffected[];
  published?: string;
  modified?: string;
  references?: { type: string; url: string }[];
}

function extractCvssScore(vuln: OsvVuln): number | null {
  if (!vuln.severity) return null;
  for (const s of vuln.severity) {
    if (s.type === 'CVSS_V3' || s.type === 'CVSS_V31' || s.type === 'CVSS_V4') {
      const n = parseFloat(s.score);
      if (!isNaN(n) && n <= 10) return n;
    }
  }
  return null;
}

function scoreSeverity(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Treat each installed package as belonging to the ecosystem in its
 * metadata.ecosystem tag. Defaults to "Linux" (system).
 */
function packageEcosystem(pkg: { metadata?: unknown }): string {
  const meta = pkg.metadata as Record<string, unknown> | undefined;
  const tagged = typeof meta?.ecosystem === 'string' ? (meta.ecosystem as string) : null;
  return tagged ?? 'Linux';
}

// Local alias map mirroring a subset of cve-matcher ALIASES. We only use this
// as a fallback for OSV `affected.package.name` strings that don't match an
// installed pkg directly. Authoritative aliases live in cve-matcher.ts.
const ALIAS_LOOKUP: Record<string, string> = {
  linux: brand.kernelPackage,
  linux_kernel: brand.kernelPackage,
  python: 'python3',
  openssl_project: 'openssl',
  libcurl: 'curl',
  mesa3d: 'mesa',
  gnu_c_library: 'glibc',
  eglibc: 'glibc',
  sqlite3: 'sqlite',
  libjpeg: 'libjpeg-turbo',
  libjpeg_turbo: 'libjpeg-turbo',
  zlib1g: 'zlib',
  'xz-utils': 'xz',
  freetype2: 'freetype',
  'harfbuzz-ng': 'harfbuzz',
  libpng16: 'libpng',
};

export async function processOsvCve(): Promise<void> {
  // We need full rows (with metadata) to ecosystem-tag each package. The
  // existing loadPackageMap() gives us a {name -> {id, version}} map but no
  // metadata, so query directly.
  const packageMap = await loadPackageMap();
  if (packageMap.size === 0) {
    logger.info('OSV CVE worker: no packages in database, skipping');
    return;
  }

  const fullPkgs = await db
    .select({
      id: schema.packages.id,
      name: schema.packages.name,
      version: schema.packages.version,
      metadata: schema.packages.metadata,
    })
    .from(schema.packages);
  const pkgByName = new Map(fullPkgs.map((p) => [p.name, p]));
  const pkgEcoByName = new Map<string, string>();
  for (const p of fullPkgs) pkgEcoByName.set(p.name, packageEcosystem(p));

  const reverseAliases = getReverseAliases();

  // -- Build OSV query list ---------------------------------------------
  // For each installed package, query OSV with that package's declared
  // ecosystem (default Linux). Also query each known alias so OSV finds
  // upstream advisories registered under a different canonical name.
  type Query = { name: string; version: string; ecosystem: string };
  const queryPackages: Query[] = [];
  for (const pkg of fullPkgs) {
    const pkgEco = pkgEcoByName.get(pkg.name) ?? 'Linux';
    queryPackages.push({ name: pkg.name, version: pkg.version, ecosystem: pkgEco });
    const aliases = reverseAliases.get(pkg.name);
    if (aliases) {
      for (const alias of aliases) {
        queryPackages.push({ name: alias.replace(/_/g, '-'), version: pkg.version, ecosystem: pkgEco });
      }
    }
  }

  // -- Querybatch -------------------------------------------------------
  const allVulnIds = new Set<string>();
  for (let i = 0; i < queryPackages.length; i += BATCH_SIZE) {
    const batch = queryPackages.slice(i, i + BATCH_SIZE);
    const queries = batch.map((q) => ({
      package: { name: q.name, ecosystem: q.ecosystem },
      version: q.version,
    }));

    const response = await fetch(OSV_QUERY_BATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': brand.userAgent,
      },
      body: JSON.stringify({ queries }),
    });
    if (!response.ok) {
      throw new Error(`OSV query batch error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as OsvQueryBatchResponse;
    for (const result of data.results) {
      if (result.vulns) for (const v of result.vulns) allVulnIds.add(v.id);
    }
    logger.info({ batch: Math.floor(i / BATCH_SIZE) + 1, vulnIds: allVulnIds.size }, 'OSV: querybatch progress');
    if (i + BATCH_SIZE < queryPackages.length) await sleep(1000);
  }

  if (allVulnIds.size === 0) {
    logger.info('OSV CVE worker: no vulnerabilities found');
    return;
  }

  // -- Per-vuln ingestion -----------------------------------------------
  let newVulns = 0;
  let matchedLinks = 0;
  let triagedLinks = 0;
  let skippedEcosystem = 0;
  let skippedNotAffected = 0;
  const highSeverityAlerts: {
    cveId: string;
    cvssScore: number | null;
    severity: string | null;
    title: string | null;
    packageNames: string[];
  }[] = [];

  for (const vulnId of allVulnIds) {
    await sleep(200); // be a polite OSV citizen

    let vuln: OsvVuln;
    try {
      const r = await fetch(`${OSV_VULN_URL}/${vulnId}`, {
        headers: { 'User-Agent': brand.userAgent },
      });
      if (!r.ok) {
        logger.warn({ vulnId, status: r.status }, 'OSV CVE worker: failed to fetch vuln');
        continue;
      }
      vuln = (await r.json()) as OsvVuln;
    } catch (err) {
      logger.warn({ vulnId, err }, 'OSV CVE worker: error fetching vuln');
      continue;
    }

    const cveAlias = vuln.aliases?.find((a) => a.startsWith('CVE-'));
    const cveId = cveAlias ?? vuln.id;

    const cvssScore = extractCvssScore(vuln);
    const severity = scoreSeverity(cvssScore);
    const title = vuln.summary ?? vuln.details?.slice(0, 200) ?? '';
    const description = vuln.details ?? vuln.summary ?? '';
    const sourceUrl =
      vuln.references?.find((ref) => ref.type === 'WEB' || ref.type === 'ADVISORY')?.url
      ?? `https://osv.dev/vulnerability/${vuln.id}`;

    // -- Version-aware + ecosystem-aware match resolution ----------------
    const matches: PackageMatch[] = [];
    const seenPkgIds = new Set<number>();
    let primaryEcosystem: string | null = null;
    let firstFixedVersion: string | null = null;

    for (const affected of vuln.affected ?? []) {
      const advisoryEco = affected.package?.ecosystem ?? '';
      const advisoryName = affected.package?.name?.toLowerCase();
      if (!advisoryName) continue;

      const candidate =
        pkgByName.get(advisoryName) ??
        (ALIAS_LOOKUP[advisoryName] ? pkgByName.get(ALIAS_LOOKUP[advisoryName]) : undefined) ??
        pkgByName.get(advisoryName.replace(/_/g, '-'));
      if (!candidate) continue;

      const pkgEco = pkgEcoByName.get(candidate.name) ?? 'Linux';

      // -- Ecosystem sanity check -----------------------------------------
      // Drop cross-ecosystem matches: a RubyGems advisory for `zlib` must
      // NEVER link to system zlib. Accepted cases:
      //   * Same ecosystem strings (Linux <-> Linux, RubyGems <-> RubyGems)
      //   * Both system-classified (Arch Linux advisory <-> Linux package)
      //   * Advisory ecosystem unset (some OSV upstream feeds elide it)
      const ecosystemOk =
        advisoryEco === pkgEco ||
        (isSystemEcosystem(advisoryEco) && isSystemEcosystem(pkgEco)) ||
        advisoryEco === '';
      if (!ecosystemOk) {
        if (isLanguageEcosystem(advisoryEco) && isSystemEcosystem(pkgEco)) {
          logger.debug(
            { cveId, advisoryEco, advisoryName, pkg: candidate.name, pkgEco },
            'OSV: skipping cross-ecosystem match (language advisory vs system package)',
          );
        }
        skippedEcosystem++;
        continue;
      }
      primaryEcosystem ??= advisoryEco || pkgEco;

      // -- Version range evaluation ---------------------------------------
      const rr = evaluateOsvRanges(candidate.version, affected.ranges);
      let exactVersionMatch = false;
      if (rr.unknown && Array.isArray(affected.versions) && affected.versions.length > 0) {
        exactVersionMatch = affected.versions.includes(candidate.version);
      }

      if (rr.affected) {
        if (seenPkgIds.has(candidate.id)) continue;
        seenPkgIds.add(candidate.id);
        matches.push({
          packageId: candidate.id,
          packageName: candidate.name,
          confidence: 'exact',
          affectedStart: rr.introduced ?? null,
          affectedEndExcluding: rr.fixed ?? null,
          affectedEndIncluding: rr.lastAffected ?? null,
          matchSource: 'osv',
          matchReason: rr.reason,
          ecosystem: advisoryEco || pkgEco,
          needsTriage: false,
        });
        if (rr.fixed && !firstFixedVersion) firstFixedVersion = rr.fixed;
      } else if (exactVersionMatch) {
        if (seenPkgIds.has(candidate.id)) continue;
        seenPkgIds.add(candidate.id);
        matches.push({
          packageId: candidate.id,
          packageName: candidate.name,
          confidence: 'exact',
          matchSource: 'osv',
          matchReason: `installed ${candidate.version} listed in advisory.versions[]`,
          ecosystem: advisoryEco || pkgEco,
          needsTriage: false,
        });
      } else if (rr.unknown) {
        // Name + ecosystem match but range data is missing / GIT-only /
        // open-ended. Record the link as needs_triage so the operator can
        // review it, but DO NOT alert and DO NOT count as confirmed exposure.
        if (seenPkgIds.has(candidate.id)) continue;
        seenPkgIds.add(candidate.id);
        matches.push({
          packageId: candidate.id,
          packageName: candidate.name,
          confidence: 'fuzzy',
          affectedStart: rr.introduced ?? null,
          matchSource: 'osv',
          matchReason: rr.reason,
          ecosystem: advisoryEco || pkgEco,
          needsTriage: true,
        });
        triagedLinks++;
      } else {
        skippedNotAffected++;
        logger.debug(
          { cveId, pkg: candidate.name, installed: candidate.version, reason: rr.reason },
          'OSV: package not affected by published ranges',
        );
      }
    }

    // If no installed package matched (or all were skipped), drop the CVE
    // entirely - no point storing an advisory that affects nothing we ship.
    if (matches.length === 0) continue;

    // Upsert vulnerability row. We let OSV "own" rows where source=osv but
    // defer to NVD/Arch for authoritative CVSS via the existing source-priority
    // logic elsewhere (vulnerabilities.cveId is unique).
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (firstFixedVersion) updateSet.fixedVersion = firstFixedVersion;
    if (primaryEcosystem) updateSet.ecosystem = primaryEcosystem;

    const [inserted] = await db
      .insert(schema.vulnerabilities)
      .values({
        cveId,
        title: title.length > 200 ? title.slice(0, 200) + '...' : title,
        description,
        severity,
        cvssScore,
        source: 'osv',
        sourceUrl,
        publishedAt: vuln.published ? new Date(vuln.published) : null,
        fixedVersion: firstFixedVersion,
        ecosystem: primaryEcosystem,
      })
      .onConflictDoUpdate({
        target: schema.vulnerabilities.cveId,
        set: updateSet,
      })
      .returning({ id: schema.vulnerabilities.id });

    if (!inserted) continue;
    newVulns++;

    // Replace links for this vuln so previously-confirmed-now-fixed packages
    // disappear from the dashboard.
    await db
      .delete(schema.packageVulnerabilities)
      .where(eq(schema.packageVulnerabilities.vulnerabilityId, inserted.id));

    const linked = await linkVulnToPackages(inserted.id, matches);
    matchedLinks += linked;

    // Only fire alerts for confirmed-affected links - needs_triage links
    // do NOT count as exposure until an operator reviews them.
    const confirmed = matches.filter((m) => !m.needsTriage);
    if (confirmed.length > 0 && cvssScore !== null && cvssScore > 0) {
      highSeverityAlerts.push({
        cveId,
        cvssScore,
        severity,
        title,
        packageNames: confirmed.map((m) => m.packageName),
      });
    }
  }

  // Sweep orphaned CVEs (status=open but no remaining links) into fixed.
  await autoResolveOrphanedCves();

  // Threshold-filtered email alerts
  if (highSeverityAlerts.length > 0) {
    const alertSettings = await getAlertSettings();
    const cvssThreshold = alertSettings.cveMinCvss ?? 7.0;
    const filtered = highSeverityAlerts.filter((a) => (a.cvssScore ?? 0) >= cvssThreshold);
    if (filtered.length > 0) await sendCveAlerts(filtered);
  }

  logger.info(
    {
      totalVulnIds: allVulnIds.size,
      newVulns,
      matchedLinks,
      triagedLinks,
      skippedEcosystem,
      skippedNotAffected,
      alerts: highSeverityAlerts.length,
    },
    'OSV CVE worker: done',
  );
}
