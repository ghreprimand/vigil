import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { matchPackageNames, linkVulnToPackages, type PackageInfo } from '../services/cve-matcher.js';

const BLFS_ADVISORIES_URL = 'https://www.linuxfromscratch.org/blfs/advisories/';

interface BLFSAdvisory {
  id: string;       // e.g. "13.0-001"
  package: string;   // e.g. "FreeRDP"
  date: string;      // e.g. "2026-03-06"
  severity: string;  // Low, Medium, High
  description: string;
  fixedVersion: string | null;
}

/**
 * Parse advisory text lines from a BLFS advisories page.
 * Format: "#### {ver} {num} {package} Date: {date} Severity: {sev}\n\n{description}"
 */
function parseAdvisories(text: string, bookVersion: string): BLFSAdvisory[] {
  const advisories: BLFSAdvisory[] = [];

  // Split by advisory headers (#### pattern)
  const sections = text.split(/(?=####\s)/);

  for (const section of sections) {
    // Match: #### 13.0 001 PackageName Date: 2026-03-06 Severity: High
    const headerMatch = section.match(
      /####\s+(\S+)\s+(\d+)\s+(.+?)\s+Date:\s*(\S+)\s+Severity:\s*(\w+)/,
    );
    if (!headerMatch) continue;

    const [, ver, num, packageName, date, severity] = headerMatch;
    const id = `${ver}-${num.padStart(3, '0')}`;

    // Extract description (everything after the header line)
    const descStart = section.indexOf('\n');
    const description = descStart >= 0
      ? section.slice(descStart).replace(/\[.*?\]\(.*?\)/g, '').trim()
      : '';

    // Extract fixed version from BLFS advisory description.
    // Expected formats:
    //   "Update to <package>-<version>"  (most common, e.g. "Update to openssl-3.4.1")
    //   "Upgrade to <package>-<version>" (alternate wording)
    //   "In <package>-<version>,"        (e.g. "In FreeRDP-3.12.0, a buffer overflow...")
    // The named capture group `fixedVer` extracts the dotted version number.
    const versionMatch = description.match(
      /(?:Update to|Upgrade to|In)\s+\S+-(?<fixedVer>\d+(?:\.\d+)+)/i,
    );

    advisories.push({
      id,
      package: packageName.trim(),
      date,
      severity: severity.toLowerCase(),
      description,
      fixedVersion: versionMatch?.groups?.fixedVer ?? null,
    });
  }

  return advisories;
}

/**
 * Map BLFS package names to local package names.
 * BLFS uses display names (e.g. "FreeType2"), local packages use lowercase (e.g. "freetype").
 */
function normalizeBLFSName(blfsPkg: string): string {
  // Common BLFS to local mappings
  const map: Record<string, string> = {
    freetype2: 'freetype',
    freerdp: 'freerdp',
    libxml2: 'libxml2',
    bind: 'bind',
    exiv2: 'exiv2',
    curl: 'curl',
    openssl: 'openssl',
    gnutls: 'gnutls',
    'nss': 'nss',
    firefox: 'firefox',
    thunderbird: 'thunderbird',
    python3: 'python',
    cmake: 'cmake',
    git: 'git',
    vim: 'vim',
    sudo: 'sudo',
    openssh: 'openssh',
    wget: 'wget',
    'nfs-utils': 'nfs-utils',
    cups: 'cups',
    samba: 'samba',
    ghostscript: 'ghostscript',
    imagemagick: 'imagemagick',
    ffmpeg: 'ffmpeg',
    gstreamer: 'gstreamer',
    mesa: 'mesa',
    xorg: 'xorg-server',
  };

  const lower = blfsPkg.toLowerCase().replace(/\s+/g, '-');
  return map[lower] ?? lower;
}

export async function processBLFSErrata(): Promise<void> {
  logger.info('BLFS errata: starting');

  // Fetch the index page to find current book version
  const indexRes = await fetch(BLFS_ADVISORIES_URL);
  if (!indexRes.ok) {
    logger.error({ status: indexRes.status }, 'BLFS errata: failed to fetch index');
    return;
  }
  const indexHtml = await indexRes.text();

  // Find advisory page links (e.g. "13.0.html")
  const pageLinks = [...indexHtml.matchAll(/href="(\d+\.\d+)\.html"/g)]
    .map(m => m[1])
    .sort()
    .reverse(); // newest first

  if (pageLinks.length === 0) {
    logger.warn('BLFS errata: no advisory pages found');
    return;
  }

  // Build package map for matching
  const allPkgs = await db
    .select({ id: schema.packages.id, name: schema.packages.name, version: schema.packages.version })
    .from(schema.packages);
  const packageMap = new Map<string, PackageInfo>();
  for (const p of allPkgs) {
    packageMap.set(p.name, { id: p.id, name: p.name, version: p.version });
  }

  // Only process the two most recent book versions
  const pagesToCheck = pageLinks.slice(0, 2);
  let totalNew = 0;

  for (const bookVer of pagesToCheck) {
    const url = `${BLFS_ADVISORIES_URL}${bookVer}.html`;
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'BLFS errata: failed to fetch page');
      continue;
    }

    // Convert HTML to rough text - strip tags for parsing
    const html = await res.text();
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    const advisories = parseAdvisories(text, bookVer);
    logger.info({ bookVersion: bookVer, count: advisories.length }, 'BLFS errata: parsed advisories');

    for (const adv of advisories) {
      const cveId = `BLFS-SA-${adv.id}`;

      // Check if already exists
      const [existing] = await db
        .select({ id: schema.vulnerabilities.id })
        .from(schema.vulnerabilities)
        .where(eq(schema.vulnerabilities.cveId, cveId))
        .limit(1);

      if (existing) continue;

      // Map severity to CVSS-like score for sorting
      const cvssMap: Record<string, number> = { high: 8.0, medium: 5.0, low: 2.0 };
      const cvssScore = cvssMap[adv.severity] ?? 5.0;

      // Insert vulnerability
      const [vuln] = await db
        .insert(schema.vulnerabilities)
        .values({
          cveId,
          title: `${adv.package} security update (BLFS ${adv.id})`,
          description: adv.description,
          severity: adv.severity === 'high' ? 'high' : adv.severity === 'low' ? 'low' : 'medium',
          cvssScore,
          source: 'blfs',
          sourceUrl: `${BLFS_ADVISORIES_URL}consolidated.html#sa-${adv.id}`,
          fixedVersion: adv.fixedVersion,
          status: 'open',
          publishedAt: new Date(adv.date),
        })
        .returning({ id: schema.vulnerabilities.id });

      // Try to link to installed packages using the alias system
      const localName = normalizeBLFSName(adv.package);
      const matches = matchPackageNames([localName, adv.package.toLowerCase()], packageMap);
      if (adv.fixedVersion) {
        for (const m of matches) {
          m.affectedEndExcluding = adv.fixedVersion;
        }
      }
      await linkVulnToPackages(vuln.id, matches);

      totalNew++;
      logger.info(
        { cveId, package: adv.package, localName, severity: adv.severity, fixedVersion: adv.fixedVersion },
        'BLFS errata: new advisory',
      );
    }
  }

  logger.info({ newAdvisories: totalNew }, 'BLFS errata: complete');
}
