import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { config, brand } from '../config.js';
import { logger } from '../utils/logger.js';
import { loadPackageMap, matchPackageNames, linkVulnToPackages, productMatchesPackage, parseCpeVendorProduct, getMajorVersion, type PackageMatch } from '../services/cve-matcher.js';
import { compareVersions } from '../services/version-compare.js';

// -- Trust gates ----------------------------------------------------------
//
// CPE product names are not globally unique. Some collide between unrelated
// products (Drupal "boost" module vs C++ Boost library, FlexCMS vs lexer
// flex, etc.). The allow-list below names the vendors we accept for the
// listed ambiguous products. ANY other vendor for that product is dropped.
//
// Format: product -> allowed vendor(s). Missing product = no vendor gate.
const CPE_VENDOR_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  boost: new Set(['boost']),
  flex: new Set(['westes', 'flex_project', 'flex-project']),
  lz4: new Set(['lz4_project', 'lz4-project', 'yann_collet']),
  mujs: new Set(['artifex']),
  // Generic "linux" CPE product is almost never the kernel - the kernel is
  // published under product "linux_kernel". Drop bare "linux" matches.
  linux: new Set(['_BLOCKED_']),
  // krb5 product appears in both MIT Kerberos and unrelated entries; pin to MIT.
  krb5: new Set(['mit']),
  kerberos: new Set(['mit']),
  kerberos_5: new Set(['mit']),
};

/** A version string we can't meaningfully compare against semver (commit SHA, "r118", git*). */
function looksLikeOpaqueRevision(v: string | undefined | null): boolean {
  if (!v) return false;
  if (/^[0-9a-f]{7,40}$/i.test(v)) return true;       // git SHA
  if (/^r\d+$/i.test(v)) return true;                 // svn-style revision
  if (/^git/i.test(v)) return true;                   // "git-2024..."
  // Doesn't start with a digit and has no version-looking dotted segments -> suspect.
  if (!/^\d/.test(v) && !/\d+\.\d+/.test(v)) return true;
  return false;
}

interface NvdGateDecision {
  /** 'confirm' = needs_triage=false; 'triage' = needs_triage=true; 'reject' = drop. */
  action: 'confirm' | 'triage' | 'reject';
  range?: { start?: string | null; endExcluding?: string | null; endIncluding?: string | null };
  reason: string;
}

/**
 * Decide what to do with a single (CPE-match-set, installed-package) pair.
 *
 * Confirms only when:
 *   * Vendor passes the allow-list (when product is ambiguous), AND
 *   * A CPE range covers the installed version with comparable versions, OR
 *   * The CPE has an exact-version pin equal to the installed version.
 *
 * Routes to triage (needs_triage=true) when:
 *   * Name + product look fine but no CPE range applies (older CVEs often
 *     elide ranges entirely).
 *   * Range comparison involves an opaque revision string.
 *   * Range is implausibly wide (no startIncluding + endExcluding's major
 *     differs from installed major by >1 - likely a different product line
 *     like krb5-v4 vs krb5-v5).
 *
 * Rejects hard for vendor-allowlist violations and out-of-range comparable
 * matches.
 */
function gateNvdMatch(
  installedVersion: string,
  packageName: string,
  cpeMatches: NvdCpeMatch[],
  cpeVendorProducts: Map<string, string>,
): NvdGateDecision {
  // Vendor allow-list check.
  for (const [product, vendor] of cpeVendorProducts) {
    if (!productMatchesPackage(product, packageName)) continue;
    const allow = CPE_VENDOR_ALLOWLIST[product.toLowerCase()];
    if (allow && !allow.has(vendor.toLowerCase())) {
      return { action: 'reject', reason: `vendor "${vendor}" not allowed for ambiguous product "${product}"` };
    }
  }

  const installedMajor = getMajorVersion(installedVersion);
  let bestTriage: NvdGateDecision | null = null;
  let sawProductMatch = false;

  for (const cpe of cpeMatches) {
    const product = parseCpeProduct(cpe.criteria);
    if (!product || !productMatchesPackage(product, packageName)) continue;
    sawProductMatch = true;

    const start = cpe.versionStartIncluding ?? null;
    const endExcl = cpe.versionEndExcluding ?? null;
    const endIncl = cpe.versionEndIncluding ?? null;
    const hasRange = !!(start || endExcl || endIncl);

    if (hasRange) {
      if (looksLikeOpaqueRevision(start) || looksLikeOpaqueRevision(endExcl) || looksLikeOpaqueRevision(endIncl)) {
        bestTriage ??= {
          action: 'triage',
          range: { start, endExcluding: endExcl, endIncluding: endIncl },
          reason: 'advisory range uses opaque revision string - cannot confirm against installed version',
        };
        continue;
      }

      const startOk = start ? compareVersions(installedVersion, start) >= 0 : true;
      const endOk =
        endExcl ? compareVersions(installedVersion, endExcl) < 0
        : endIncl ? compareVersions(installedVersion, endIncl) <= 0
        : true;

      if (!startOk || !endOk) continue;

      // Implausibility guard: no startIncluding + far-end-major.
      if (!start && installedMajor !== null) {
        const endRef = endExcl ?? endIncl;
        if (endRef) {
          const endMajor = getMajorVersion(endRef);
          if (endMajor !== null && Math.abs(endMajor - installedMajor) > 1) {
            bestTriage ??= {
              action: 'triage',
              range: { start: null, endExcluding: endExcl, endIncluding: endIncl },
              reason: `unbounded-start range ends at ${endRef} but installed major ${installedMajor} is far from end major ${endMajor} - likely different product line`,
            };
            continue;
          }
        }
      }

      return {
        action: 'confirm',
        range: { start, endExcluding: endExcl, endIncluding: endIncl },
        reason: start
          ? (endExcl ? `installed ${installedVersion} in [${start}, ${endExcl})` : `installed ${installedVersion} >= ${start}${endIncl ? `, <= ${endIncl}` : ''}`)
          : (endExcl ? `installed ${installedVersion} < ${endExcl}` : `installed ${installedVersion} <= ${endIncl}`),
      };
    }

    // No range - try exact-version pin in CPE URI.
    const cpeVer = parseCpeVersion(cpe.criteria);
    if (cpeVer && cpeVer !== '*' && cpeVer !== '-') {
      if (compareVersions(installedVersion, cpeVer) === 0) {
        return {
          action: 'confirm',
          range: {},
          reason: `installed ${installedVersion} matches exact CPE version ${cpeVer}`,
        };
      }
      continue;
    }

    // Wildcard / no version data - record as triage candidate.
    bestTriage ??= {
      action: 'triage',
      range: {},
      reason: 'CPE entry has no version range or exact-version pin - name-only match',
    };
  }

  if (bestTriage) return bestTriage;
  if (sawProductMatch) {
    return { action: 'reject', reason: 'all CPE ranges for this product exclude the installed version' };
  }
  return { action: 'reject', reason: 'no CPE entry matches package name' };
}
import { sendCveAlerts, getAlertSettings } from '../services/notifications.js';
import { autoResolveOrphanedCves } from '../services/manifest.js';
import { logActivity } from '../services/activity.js';

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const LOOKBACK_HOURS = 6;
const PAGE_SIZE = 200;
const SETTINGS_KEY = 'nvd_last_check';

interface NvdResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: NvdVulnWrapper[];
}

interface NvdVulnWrapper {
  cve: {
    id: string;
    descriptions: { lang: string; value: string }[];
    metrics?: {
      cvssMetricV31?: { cvssData: { baseScore: number; baseSeverity: string } }[];
      cvssMetricV30?: { cvssData: { baseScore: number; baseSeverity: string } }[];
    };
    published: string;
    lastModified: string;
    configurations?: NvdConfiguration[];
  };
}

interface NvdConfiguration {
  nodes: NvdNode[];
}

interface NvdNode {
  operator: string;
  cpeMatch: NvdCpeMatch[];
}

interface NvdCpeMatch {
  vulnerable: boolean;
  criteria: string; // cpe:2.3:a:vendor:product:version:...
  versionStartIncluding?: string;
  versionEndExcluding?: string;
  versionEndIncluding?: string;
}

function parseCpeProduct(cpe: string): string | null {
  // cpe:2.3:a:vendor:product:version:...
  const parts = cpe.split(':');
  return parts.length >= 5 ? parts[4] : null;
}

function parseCpeVersion(cpe: string): string | null {
  // cpe:2.3:type:vendor:product:version:...
  const parts = cpe.split(':');
  return parts.length >= 6 ? parts[5] : null;
}

function mapNvdSeverity(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW': return 'low';
    case 'NONE': return 'none';
    default: return 'medium';
  }
}

function getDescription(cve: NvdVulnWrapper['cve']): string {
  const en = cve.descriptions.find((d) => d.lang === 'en');
  return en?.value ?? cve.descriptions[0]?.value ?? '';
}

function getCvssData(cve: NvdVulnWrapper['cve']): { score: number; severity: string } | null {
  const v31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
  if (v31) return { score: v31.baseScore, severity: v31.baseSeverity };
  const v30 = cve.metrics?.cvssMetricV30?.[0]?.cvssData;
  if (v30) return { score: v30.baseScore, severity: v30.baseSeverity };
  return null;
}

/**
 * Derive fixedVersion from CPE matches - returns the lowest versionEndExcluding
 * among CPE entries whose product matched an installed package. We use the lowest
 * because CVEs often span multiple branches (e.g., Python 3.13.x and 3.14.x) and
 * the earliest fix version is the one relevant to the installed branch.
 */
function deriveFixedVersion(cpeMatches: NvdCpeMatch[], matchedProducts: Set<string>): string | null {
  let best: string | null = null;
  for (const cpe of cpeMatches) {
    if (!cpe.versionEndExcluding) continue;
    const product = parseCpeProduct(cpe.criteria);
    if (!product || !matchedProducts.has(product)) continue;
    if (!best || compareVersions(cpe.versionEndExcluding, best) < 0) {
      best = cpe.versionEndExcluding;
    }
  }
  return best;
}

async function fetchPage(startDate: string, endDate: string, startIndex: number): Promise<NvdResponse> {
  const params = new URLSearchParams({
    lastModStartDate: startDate,
    lastModEndDate: endDate,
    resultsPerPage: String(PAGE_SIZE),
    startIndex: String(startIndex),
  });

  const headers: Record<string, string> = { 'User-Agent': brand.userAgent };
  if (config.nvd.apiKey) {
    headers['apiKey'] = config.nvd.apiKey;
  }

  const response = await fetch(`${NVD_API_BASE}?${params}`, { headers });

  if (!response.ok) {
    throw new Error(`NVD API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<NvdResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processNvdCve(): Promise<void> {
  const packageMap = await loadPackageMap();
  if (packageMap.size === 0) {
    logger.info('NVD CVE worker: no packages in database, skipping');
    return;
  }

  // Determine time window: use stored last-check timestamp if available,
  // with a 30-minute buffer to cover any overlap. Fall back to LOOKBACK_HOURS.
  const now = new Date();
  let lookback: Date;
  const lastCheckRow = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEY))
    .limit(1);

  if (lastCheckRow.length > 0 && typeof lastCheckRow[0].value === 'string') {
    const stored = new Date(lastCheckRow[0].value);
    if (!isNaN(stored.getTime())) {
      // Subtract 30-minute buffer to handle clock skew / processing delays
      lookback = new Date(stored.getTime() - 30 * 60 * 1000);
      logger.info({ storedLastCheck: stored.toISOString(), lookback: lookback.toISOString() }, 'NVD CVE worker: using stored last-check timestamp');
    } else {
      lookback = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
    }
  } else {
    lookback = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
    logger.info({ lookbackHours: LOOKBACK_HOURS }, 'NVD CVE worker: no stored last-check, using default lookback');
  }

  const startDate = lookback.toISOString();
  const endDate = now.toISOString();

  const delayMs = config.nvd.apiKey ? 650 : 6500;

  let startIndex = 0;
  let totalResults = 0;
  let newVulns = 0;
  let matchedLinks = 0;
  const highSeverityAlerts: { cveId: string; cvssScore: number | null; severity: string | null; title: string | null; packageNames: string[] }[] = [];

  do {
    const data = await fetchPage(startDate, endDate, startIndex);
    totalResults = data.totalResults;

    logger.info({ startIndex, totalResults, pageSize: data.resultsPerPage }, 'NVD CVE worker: fetched page');

    for (const wrapper of data.vulnerabilities) {
      const cve = wrapper.cve;
      const cvss = getCvssData(cve);
      const description = getDescription(cve);
      const severity = cvss ? mapNvdSeverity(cvss.severity) : null;
      const title = description.length > 200 ? description.slice(0, 200) + '...' : description;

      // Extract product names and version ranges from CPE
      const productNames: string[] = [];
      const cpeMatches: NvdCpeMatch[] = [];
      // Track vendor:product pairs for disambiguation (e.g., gnu:wget2 != gnu:wget)
      const cpeVendorProducts = new Map<string, string>(); // product -> vendor

      for (const conf of cve.configurations ?? []) {
        if (!Array.isArray(conf.nodes)) continue;
        for (const node of conf.nodes) {
          for (const cpeMatch of node.cpeMatch ?? []) {
            if (!cpeMatch.vulnerable) continue;
            const product = parseCpeProduct(cpeMatch.criteria);
            if (product && product !== '*') {
              productNames.push(product);
              cpeMatches.push(cpeMatch);
              const vp = parseCpeVendorProduct(cpeMatch.criteria);
              if (vp) cpeVendorProducts.set(vp.product, vp.vendor);
            }
          }
        }
      }

      // Match to our packages
      const pkgMatches = matchPackageNames(productNames, packageMap);

      // Guard: reject matches where the CPE product differs from the package name.
      // This catches cases like CPE product "wget2" fuzzy-matching package "wget"
      // due to NVD data drift (CPE initially had "wget", later corrected to "wget2").
      // If no CPE product exactly matches the package name (or via alias/normalization),
      // the match is suspect - skip it.
      const verifiedMatches = pkgMatches.filter((match) => {
        for (const [cpeProduct] of cpeVendorProducts) {
          if (productMatchesPackage(cpeProduct, match.packageName)) return true;
        }
        logger.debug({ cveId: cve.id, packageName: match.packageName, cpeProducts: Array.from(cpeVendorProducts.keys()) },
          'NVD CVE worker: rejected match - no CPE product matches package name');
        return false;
      });

      // Gate by vendor and version-range quality. Confirm only when NVD gives
      // comparable evidence that the installed version is affected; otherwise
      // keep plausible name matches in Needs triage instead of Open.
      const filteredMatches: PackageMatch[] = [];
      for (const match of verifiedMatches) {
        const pkg = packageMap.get(match.packageName);
        if (!pkg) continue;

        const gate = gateNvdMatch(pkg.version, match.packageName, cpeMatches, cpeVendorProducts);
        if (gate.action === 'reject') {
          logger.debug({ cveId: cve.id, packageName: match.packageName, installed: pkg.version, reason: gate.reason },
            'NVD CVE worker: rejected by trust gate');
          continue;
        }

        filteredMatches.push({
          ...match,
          affectedStart: gate.range?.start ?? null,
          affectedEndExcluding: gate.range?.endExcluding ?? null,
          affectedEndIncluding: gate.range?.endIncluding ?? null,
          matchSource: 'nvd',
          matchReason: gate.reason,
          ecosystem: 'Linux',
          needsTriage: gate.action === 'triage',
          confidence: gate.action === 'triage' ? 'fuzzy' : match.confidence,
        });
      }

      // Skip CVEs with no package name matches against our installed packages
      if (verifiedMatches.length === 0) continue;

      // Use trust-gated matches only - never fall back to unfiltered pkgMatches.
      // An empty filteredMatches means all matched packages were rejected by the gate.
      const matchesToLink = filteredMatches;

      // Derive fixedVersion from CPE data (highest versionEndExcluding among matched products)
      const matchedProducts = new Set(verifiedMatches.map((m) => m.packageName));
      const fixedVersion = deriveFixedVersion(cpeMatches, matchedProducts);

      // Upsert vulnerability
      const updateSet: Record<string, any> = {
        title,
        description,
        severity,
        cvssScore: cvss?.score ?? null,
        sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
        updatedAt: new Date(),
      };
      // Only overwrite fixedVersion when we have a value (avoid clobbering Arch/OSV data)
      if (fixedVersion) updateSet.fixedVersion = fixedVersion;

      const [vuln] = await db
        .insert(schema.vulnerabilities)
        .values({
          cveId: cve.id,
          title,
          description,
          severity,
          cvssScore: cvss?.score ?? null,
          source: 'nvd',
          sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
          publishedAt: new Date(cve.published),
          fixedVersion,
        })
        .onConflictDoUpdate({
          target: schema.vulnerabilities.cveId,
          set: updateSet,
        })
        .returning({ id: schema.vulnerabilities.id, fixedVersion: schema.vulnerabilities.fixedVersion });

      if (!vuln) continue;
      newVulns++;

      // Remove stale package links before re-linking.
      // This cleans up links to packages that have since been upgraded past the fixed version.
      await db.delete(schema.packageVulnerabilities)
        .where(eq(schema.packageVulnerabilities.vulnerabilityId, vuln.id));

      // Filter out packages already at or past the fix version
      const effectiveFixedVersion = vuln.fixedVersion;
      let finalMatches = matchesToLink;
      if (effectiveFixedVersion) {
        const cleared: string[] = [];
        finalMatches = matchesToLink.filter((match) => {
          const pkg = packageMap.get(match.packageName);
          if (!pkg) return false;
          if (compareVersions(pkg.version, effectiveFixedVersion) >= 0) {
            cleared.push(match.packageName);
            return false;
          }
          return true;
        });
        if (cleared.length > 0) {
          logger.info({ cveId: cve.id, cleared, fixedVersion: effectiveFixedVersion }, 'NVD CVE worker: auto-cleared - installed version meets fix');
          await logActivity('cve_auto_cleared', `${cve.id} auto-cleared: ${cleared.join(', ')} already at or past fix version ${effectiveFixedVersion}`, {
            cveId: cve.id,
            packages: cleared,
            fixedVersion: effectiveFixedVersion,
          });
        }
      }

      // Major version sanity check: if the fix version has a different major than the
      // installed version, this likely indicates a different product line (e.g., wget 1.x
      // vs wget2 2.x). Skip fuzzy matches where majors diverge.
      if (effectiveFixedVersion && finalMatches.length > 0) {
        finalMatches = finalMatches.filter((match) => {
          const pkg = packageMap.get(match.packageName);
          if (!pkg) return false;
          const installedMajor = getMajorVersion(pkg.version);
          const fixMajor = getMajorVersion(effectiveFixedVersion);
          if (installedMajor !== null && fixMajor !== null && installedMajor !== fixMajor) {
            // For exact product name matches, allow it (legitimate multi-major CVEs exist)
            if (match.confidence === 'exact') {
              // Only allow if a CPE product exactly equals the package name (not via alias)
              const hasDirectMatch = Array.from(cpeVendorProducts.keys()).some(
                (p) => p.toLowerCase() === match.packageName,
              );
              if (hasDirectMatch) return true;
            }
            logger.info({ cveId: cve.id, packageName: match.packageName, installed: pkg.version, fixedVersion: effectiveFixedVersion },
              'NVD CVE worker: skipped - major version mismatch suggests different product');
            return false;
          }
          return true;
        });
      }

      if (finalMatches.length > 0) {
        const linked = await linkVulnToPackages(vuln.id, finalMatches);
        matchedLinks += linked;

        // Queue alerts only for confirmed links. Needs-triage links are visible
        // to the operator but should not page as known exposure.
        const confirmedMatches = finalMatches.filter((m) => !m.needsTriage);
        if (cvss && cvss.score > 0 && confirmedMatches.length > 0) {
          highSeverityAlerts.push({
            cveId: cve.id,
            cvssScore: cvss.score,
            severity,
            title,
            packageNames: confirmedMatches.map((m) => m.packageName),
          });
        }
      }
    }

    startIndex += data.resultsPerPage;

    // Rate limiting
    if (startIndex < totalResults) {
      await sleep(delayMs);
    }
  } while (startIndex < totalResults);

  // Auto-resolve open CVEs that no longer have any package links
  await autoResolveOrphanedCves();

  // Update last check time
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, value: now.toISOString() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: now.toISOString(), updatedAt: now },
    });

  // Filter alerts by user-configured CVSS threshold before sending
  if (highSeverityAlerts.length > 0) {
    const alertSettings = await getAlertSettings();
    const cvssThreshold = alertSettings.cveMinCvss ?? 7.0;
    const filteredAlerts = highSeverityAlerts.filter((a) => (a.cvssScore ?? 0) >= cvssThreshold);
    if (filteredAlerts.length > 0) {
      await sendCveAlerts(filteredAlerts);
    }
  }

  logger.info(
    { totalResults, newVulns, matchedLinks, alerts: highSeverityAlerts.length },
    'NVD CVE worker: done',
  );
}
