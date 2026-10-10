import nodemailer, { type Transporter } from 'nodemailer';
import { config, brand } from '../config.js';
import { fmtMonthYear } from '../utils/dates.js';
import { db, schema } from '../db/index.js';
import { eq, gte, desc, sql, and, count, isNotNull, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

// -- Alert Settings ----------------------------------------------------------

export interface AlertSettings {
  email: string;
  cveEnabled: boolean;
  cveMinCvss: number;
  unmappedEnabled: boolean;
  digestEnabled: boolean;
  stalenessEnabled: boolean;
  stalenessMinScore: number;
  watchedEnabled: boolean;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(sql`${schema.settings.key} LIKE 'alert_%'`);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  return {
    email: map['alert_email'] || config.smtp.alertEmail || '',
    cveEnabled: map['alert_cve_enabled'] !== '0',
    cveMinCvss: parseFloat(map['alert_cve_min_cvss'] ?? '7.0') || 7.0,
    unmappedEnabled: map['alert_unmapped_enabled'] !== '0',
    digestEnabled: map['alert_digest_enabled'] !== '0',
    stalenessEnabled: map['alert_staleness_enabled'] === '1',
    stalenessMinScore: parseInt(map['alert_staleness_min_score'] ?? '20', 10) || 20,
    watchedEnabled: map['alert_watched_enabled'] !== '0',
  };
}

export async function saveAlertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value: value as unknown, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: value as unknown, updatedAt: new Date() },
    });
}

// -- SMTP Transport ----------------------------------------------------------

export function isSmtpConfigured(recipientEmail: string): boolean {
  return !!(config.smtp.enabled && config.smtp.user && config.smtp.pass && recipientEmail);
}

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  await getTransporter().sendMail({ from: config.smtp.from, to, subject, html });
}

// -- CVE Alerts --------------------------------------------------------------

export interface CveAlert {
  cveId: string;
  cvssScore: number | null;
  severity: string | null;
  title: string | null;
  packageNames: string[];
}

/**
 * Send immediate email alerts for high-severity CVEs.
 * Threshold and enabled state come from DB settings (configurable in UI).
 * Deduplicates: won't re-alert for the same CVE within 24 hours.
 */
export async function sendCveAlerts(alerts: CveAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  const s = await getAlertSettings();
  if (!s.cveEnabled || !isSmtpConfigured(s.email)) return;

  // Apply configurable CVSS threshold
  const filtered = alerts.filter((a) => (a.cvssScore ?? 0) >= s.cveMinCvss);
  if (filtered.length === 0) return;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Deduplicate: skip CVEs already alerted within 24h
  const toSend: CveAlert[] = [];
  for (const alert of filtered) {
    const [existing] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, 'cve_alert'),
          gte(schema.notifications.sentAt, cutoff),
          sql`json_extract(${schema.notifications.metadata}, '$.cveId') = ${alert.cveId}`,
        ),
      )
      .limit(1);
    if (!existing) toSend.push(alert);
  }
  if (toSend.length === 0) return;

  const baseUrl = config.baseUrl;
  const rows = toSend
    .map(
      (a) =>
        `<tr>
          <td><a href="${baseUrl}/cves/${a.cveId}">${a.cveId}</a></td>
          <td>${a.cvssScore ?? 'N/A'}</td>
          <td>${a.severity ?? 'unknown'}</td>
          <td>${a.packageNames.join(', ') || 'none'}</td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <h2>${brand.productName}: New CVE Alert</h2>
    <p>${toSend.length} CVE(s) with CVSS &ge; ${s.cveMinCvss} affect your packages:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>CVE</th><th>CVSS</th><th>Severity</th><th>Packages</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p><a href="${baseUrl}/cves">View all CVEs on dashboard</a></p>
  `;
  const subject = `[${brand.productName}] ${toSend.length} CVE(s) detected (CVSS &ge; ${s.cveMinCvss})`;

  try {
    await sendMail(s.email, subject, html);
    for (const alert of toSend) {
      await db.insert(schema.notifications).values({
        type: 'cve_alert',
        recipient: s.email,
        subject,
        metadata: { cveId: alert.cveId, cvssScore: alert.cvssScore },
      });
    }
    logger.info({ count: toSend.length }, 'CVE alert email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send CVE alert email');
  }
}

// -- Unmapped Package Alerts -------------------------------------------------

/**
 * Send a one-time alert for packages with no upstream source after auto-detection.
 * Deduplicates per package name permanently (never re-alerts for the same package).
 */
export async function sendUnmappedPackagesAlert(packageNames: string[]): Promise<void> {
  if (packageNames.length === 0) return;
  const s = await getAlertSettings();
  if (!s.unmappedEnabled || !isSmtpConfigured(s.email)) return;

  const alreadyNotified = await db
    .select({ metadata: schema.notifications.metadata })
    .from(schema.notifications)
    .where(eq(schema.notifications.type, 'unmapped_package'));

  const notifiedNames = new Set(
    alreadyNotified.map((n) => (n.metadata as Record<string, unknown>)?.packageName as string),
  );

  const toAlert = packageNames.filter((name) => !notifiedNames.has(name));
  if (toAlert.length === 0) return;

  const baseUrl = config.baseUrl;
  const rows = toAlert
    .sort()
    .map((name) => `<tr><td style="font-family:monospace;">${name}</td></tr>`)
    .join('\n');

  const html = `
    <h2>${brand.productName}: New Packages Without Upstream Sources</h2>
    <p>${toAlert.length} new package(s) were added but no upstream source could be found automatically:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>Package</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Open each package on the dashboard and configure an upstream source manually.</p>
    <p><a href="${baseUrl}/packages?status=unchecked">View unmonitored packages</a></p>
  `;
  const subject =
    toAlert.length === 1
      ? `[${brand.productName}] New unmonitored package: ${toAlert[0]}`
      : `[${brand.productName}] ${toAlert.length} new packages without upstream sources`;

  try {
    await sendMail(s.email, subject, html);
    for (const name of toAlert) {
      await db.insert(schema.notifications).values({
        type: 'unmapped_package',
        recipient: s.email,
        subject,
        metadata: { packageName: name },
      });
    }
    logger.info({ count: toAlert.length }, 'Unmapped package alert sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send unmapped package alert email');
  }
}

// -- Weekly Digest -----------------------------------------------------------

export async function sendWeeklyDigest(): Promise<void> {
  const s = await getAlertSettings();
  if (!s.digestEnabled || !isSmtpConfigured(s.email)) {
    logger.info('Weekly digest skipped: disabled or SMTP not configured');
    return;
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const newCves = await db
    .select()
    .from(schema.vulnerabilities)
    .where(gte(schema.vulnerabilities.createdAt, oneWeekAgo))
    .orderBy(desc(schema.vulnerabilities.cvssScore))
    .limit(50);

  const [openStats] = await db
    .select({ total: count() })
    .from(schema.vulnerabilities)
    .where(eq(schema.vulnerabilities.status, 'open'));

  const [criticalStats] = await db
    .select({ total: count() })
    .from(schema.vulnerabilities)
    .where(and(eq(schema.vulnerabilities.status, 'open'), eq(schema.vulnerabilities.severity, 'critical')));

  const outdated = await db
    .select({
      name: schema.packages.name,
      installed: schema.packages.version,
      upstream: schema.upstreamReleases.version,
    })
    .from(schema.upstreamReleases)
    .innerJoin(schema.packages, eq(schema.upstreamReleases.packageId, schema.packages.id))
    .where(eq(schema.upstreamReleases.isNewer, true))
    .orderBy(desc(schema.upstreamReleases.releaseDate))
    .limit(20);

  const baseUrl = config.baseUrl;
  const dateStr = new Date().toISOString().slice(0, 10);

  const cveRows = newCves
    .map(
      (c) =>
        `<tr>
          <td><a href="${baseUrl}/cves/${c.cveId}">${c.cveId}</a></td>
          <td>${c.cvssScore ?? 'N/A'}</td>
          <td>${c.severity ?? '-'}</td>
          <td>${c.status}</td>
        </tr>`,
    )
    .join('\n');

  const outdatedRows = outdated
    .map(
      (o) =>
        `<tr>
          <td><a href="${baseUrl}/packages/${encodeURIComponent(o.name)}">${o.name}</a></td>
          <td>${o.installed}</td>
          <td>${o.upstream}</td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <h2>${brand.productName} - Weekly Digest (${dateStr})</h2>
    <h3>Summary</h3>
    <ul>
      <li>Open CVEs: <strong>${openStats?.total ?? 0}</strong></li>
      <li>Critical: <strong>${criticalStats?.total ?? 0}</strong></li>
      <li>New this week: <strong>${newCves.length}</strong></li>
      <li>Outdated packages: <strong>${outdated.length}+</strong></li>
    </ul>
    ${newCves.length > 0 ? `
      <h3>New CVEs This Week</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr><th>CVE</th><th>CVSS</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${cveRows}</tbody>
      </table>` : '<p>No new CVEs this week. OK</p>'}
    ${outdated.length > 0 ? `
      <h3>Top Outdated Packages</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr><th>Package</th><th>Installed</th><th>Latest</th></tr></thead>
        <tbody>${outdatedRows}</tbody>
      </table>` : ''}
    <p><a href="${baseUrl}">Open Dashboard</a> &bull; <a href="${baseUrl}/settings">Manage alert settings</a></p>
  `;
  const subject = `[${brand.productName}] Weekly Digest - ${dateStr}`;

  try {
    await sendMail(s.email, subject, html);
    await db.insert(schema.notifications).values({
      type: 'digest_weekly',
      recipient: s.email,
      subject,
      metadata: { openCves: openStats?.total ?? 0, criticalCves: criticalStats?.total ?? 0, newCves: newCves.length },
    });
    logger.info('Weekly digest email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send weekly digest email');
  }
}

// -- Monthly Digest ----------------------------------------------------------

export async function sendMonthlyDigest(): Promise<void> {
  const s = await getAlertSettings();
  if (!s.digestEnabled || !isSmtpConfigured(s.email)) {
    logger.info('Monthly digest skipped: disabled or SMTP not configured');
    return;
  }

  // Don't re-send within 25 days
  const cutoff = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.type, 'digest_monthly'), gte(schema.notifications.sentAt, cutoff)))
    .limit(1);
  if (recent) return;

  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const newCves = await db
    .select()
    .from(schema.vulnerabilities)
    .where(gte(schema.vulnerabilities.createdAt, oneMonthAgo))
    .orderBy(desc(schema.vulnerabilities.cvssScore))
    .limit(50);

  const [openStats] = await db
    .select({ total: count() })
    .from(schema.vulnerabilities)
    .where(eq(schema.vulnerabilities.status, 'open'));

  const [resolvedStats] = await db
    .select({ total: count() })
    .from(schema.vulnerabilities)
    .where(
      and(
        eq(schema.vulnerabilities.status, 'fixed'),
        gte(schema.vulnerabilities.updatedAt, oneMonthAgo),
      ),
    );

  const outdated = await db
    .select({
      name: schema.packages.name,
      installed: schema.packages.version,
      upstream: schema.upstreamReleases.version,
    })
    .from(schema.upstreamReleases)
    .innerJoin(schema.packages, eq(schema.upstreamReleases.packageId, schema.packages.id))
    .where(eq(schema.upstreamReleases.isNewer, true))
    .orderBy(desc(schema.upstreamReleases.releaseDate))
    .limit(30);

  // Staleness trend (if available)
  const trendRows = await db
    .select()
    .from(schema.stalenessHistory)
    .orderBy(desc(schema.stalenessHistory.snapshotDate))
    .limit(30);

  const baseUrl = config.baseUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  const monthStr = fmtMonthYear();

  let trendHtml = '';
  if (trendRows.length >= 2) {
    const oldest = trendRows[trendRows.length - 1];
    const newest = trendRows[0];
    const scoreDelta = (newest.avgScore ?? 0) - (oldest.avgScore ?? 0);
    const direction = scoreDelta > 0 ? 'increased' : scoreDelta < 0 ? 'decreased' : 'unchanged';
    trendHtml = `
      <h3>Staleness Trend (30-day)</h3>
      <ul>
        <li>Average staleness score: <strong>${(newest.avgScore ?? 0).toFixed(1)}</strong> (${direction} from ${(oldest.avgScore ?? 0).toFixed(1)})</li>
        <li>Outdated packages: <strong>${newest.packagesOutdated}</strong></li>
      </ul>`;
  }

  const cveRows = newCves.slice(0, 20)
    .map(
      (c) =>
        `<tr>
          <td><a href="${baseUrl}/cves/${c.cveId}">${c.cveId}</a></td>
          <td>${c.cvssScore ?? 'N/A'}</td>
          <td>${c.severity ?? '-'}</td>
          <td>${c.status}</td>
        </tr>`,
    )
    .join('\n');

  const outdatedRows = outdated.slice(0, 15)
    .map(
      (o) =>
        `<tr>
          <td><a href="${baseUrl}/packages/${encodeURIComponent(o.name)}">${o.name}</a></td>
          <td>${o.installed}</td>
          <td>${o.upstream}</td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <h2>${brand.productName} - Monthly Digest (${monthStr})</h2>
    <h3>Summary</h3>
    <ul>
      <li>Open CVEs: <strong>${openStats?.total ?? 0}</strong></li>
      <li>CVEs resolved this month: <strong>${resolvedStats?.total ?? 0}</strong></li>
      <li>New CVEs this month: <strong>${newCves.length}</strong></li>
      <li>Outdated packages: <strong>${outdated.length}+</strong></li>
    </ul>
    ${trendHtml}
    ${newCves.length > 0 ? `
      <h3>New CVEs This Month (top 20)</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr><th>CVE</th><th>CVSS</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${cveRows}</tbody>
      </table>` : '<p>No new CVEs this month.</p>'}
    ${outdated.length > 0 ? `
      <h3>Top Outdated Packages</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr><th>Package</th><th>Installed</th><th>Latest</th></tr></thead>
        <tbody>${outdatedRows}</tbody>
      </table>` : ''}
    <p><a href="${baseUrl}">Open Dashboard</a> &bull; <a href="${baseUrl}/settings">Manage alert settings</a></p>
  `;
  const subject = `[${brand.productName}] Monthly Digest - ${monthStr}`;

  try {
    await sendMail(s.email, subject, html);
    await db.insert(schema.notifications).values({
      type: 'digest_monthly',
      recipient: s.email,
      subject,
      metadata: { openCves: openStats?.total ?? 0, newCves: newCves.length, resolved: resolvedStats?.total ?? 0 },
    });
    logger.info('Monthly digest email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send monthly digest email');
  }
}

// -- Staleness Alert ---------------------------------------------------------

/**
 * Send a weekly alert listing packages above the staleness score threshold.
 * Deduplicates: sends at most once per week.
 */
export async function sendStalenessAlert(): Promise<void> {
  const s = await getAlertSettings();
  if (!s.stalenessEnabled || !isSmtpConfigured(s.email)) return;

  // Don't re-send within 6 days
  const cutoff = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.type, 'staleness_alert'), gte(schema.notifications.sentAt, cutoff)))
    .limit(1);
  if (recent) return;

  // Subquery: latest newer upstream release per package (row_number to pick one)
  const latestUpstream = db
    .select({
      packageId: schema.upstreamReleases.packageId,
      upstreamVersion: schema.upstreamReleases.version,
      rn: sql<number>`row_number() over (partition by ${schema.upstreamReleases.packageId} order by ${schema.upstreamReleases.releaseDate} desc nulls last, ${schema.upstreamReleases.discoveredAt} desc)`.as('rn'),
    })
    .from(schema.upstreamReleases)
    .where(eq(schema.upstreamReleases.isNewer, true))
    .as('latest_upstream');

  // Subquery: open CVE count per package
  const cveCountSub = db
    .select({
      packageId: schema.packageVulnerabilities.packageId,
      cveCount: count().as('cve_count'),
    })
    .from(schema.packageVulnerabilities)
    .innerJoin(schema.vulnerabilities, eq(schema.packageVulnerabilities.vulnerabilityId, schema.vulnerabilities.id))
    .where(eq(schema.vulnerabilities.status, 'open'))
    .groupBy(schema.packageVulnerabilities.packageId)
    .as('cve_counts');

  const staleRows = await db
    .select({
      name: schema.packages.name,
      installedVersion: schema.packages.version,
      score: schema.stalenessScores.score,
      upstreamVersion: latestUpstream.upstreamVersion,
      daysBehind: schema.stalenessScores.daysBehind,
      openCves: sql<number>`coalesce(${cveCountSub.cveCount}, 0)`,
    })
    .from(schema.stalenessScores)
    .innerJoin(schema.packages, eq(schema.stalenessScores.packageId, schema.packages.id))
    .leftJoin(latestUpstream, and(
      eq(latestUpstream.packageId, schema.packages.id),
      eq(latestUpstream.rn, 1),
    ))
    .leftJoin(cveCountSub, eq(cveCountSub.packageId, schema.packages.id))
    .where(and(
      gte(schema.stalenessScores.score, s.stalenessMinScore),
      isNull(schema.packages.pinnedAt),
    ))
    .orderBy(desc(schema.stalenessScores.score))
    .limit(30);

  if (staleRows.length === 0) return;

  const baseUrl = config.baseUrl;
  const tableRows = staleRows
    .map(
      (r) =>
        `<tr>
          <td><a href="${baseUrl}/packages/${encodeURIComponent(r.name)}">${r.name}</a></td>
          <td>${r.installedVersion}</td>
          <td>${r.upstreamVersion ?? '-'}</td>
          <td>${Number(r.score).toFixed(1)}</td>
          <td>${r.daysBehind ?? '-'}</td>
          <td>${r.openCves}</td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <h2>${brand.productName}: Staleness Alert</h2>
    <p>${staleRows.length} package(s) have a staleness score &ge; ${s.stalenessMinScore} and need attention:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>Package</th><th>Installed</th><th>Latest</th><th>Score</th><th>Days Behind</th><th>CVEs</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p><a href="${baseUrl}/updates">View all updates on dashboard</a></p>
  `;
  const subject = `[${brand.productName}] ${staleRows.length} package(s) with staleness score &ge; ${s.stalenessMinScore}`;

  try {
    await sendMail(s.email, subject, html);
    await db.insert(schema.notifications).values({
      type: 'staleness_alert',
      recipient: s.email,
      subject,
      metadata: { count: staleRows.length, minScore: s.stalenessMinScore },
    });
    logger.info({ count: staleRows.length }, 'Staleness alert email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send staleness alert email');
  }
}

// -- Watched Package Alerts ---------------------------------------------------

/**
 * Send immediate alerts for watched packages that have newer upstream versions.
 * Deduplicates: won't re-alert for the same package+version within 7 days.
 */
export async function sendWatchedPackageAlerts(): Promise<void> {
  const s = await getAlertSettings();
  if (!s.watchedEnabled || !isSmtpConfigured(s.email)) return;

  // Find watched packages with newer upstream releases
  // Use a subquery to get the latest newer release per package
  const latestRelease = db
    .select({
      packageId: schema.upstreamReleases.packageId,
      upstreamVersion: schema.upstreamReleases.version,
      releaseDate: schema.upstreamReleases.releaseDate,
      // Row number to pick the latest per package
      rn: sql<number>`row_number() over (partition by ${schema.upstreamReleases.packageId} order by ${schema.upstreamReleases.releaseDate} desc nulls last, ${schema.upstreamReleases.discoveredAt} desc)`.as('rn'),
    })
    .from(schema.upstreamReleases)
    .where(eq(schema.upstreamReleases.isNewer, true))
    .as('latest_release');

  const watchedRows = await db
    .select({
      name: schema.packages.name,
      installedVersion: schema.packages.version,
      upstreamVersion: latestRelease.upstreamVersion,
      releaseDate: latestRelease.releaseDate,
    })
    .from(schema.packages)
    .innerJoin(latestRelease, and(
      eq(latestRelease.packageId, schema.packages.id),
      eq(latestRelease.rn, 1),
    ))
    .where(isNotNull(schema.packages.watchedAt));

  if (watchedRows.length === 0) return;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Deduplicate: skip if already alerted for same package+version within 7 days
  const toSend: Array<{ name: string; installedVersion: string; upstreamVersion: string; releaseDate: Date | null }> = [];
  for (const row of watchedRows) {
    const [existing] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, 'watched_update'),
          gte(schema.notifications.sentAt, cutoff),
          sql`json_extract(${schema.notifications.metadata}, '$.packageName') = ${row.name}`,
          sql`json_extract(${schema.notifications.metadata}, '$.upstreamVersion') = ${row.upstreamVersion}`,
        ),
      )
      .limit(1);
    if (!existing) {
      toSend.push({
        name: row.name,
        installedVersion: row.installedVersion,
        upstreamVersion: row.upstreamVersion,
        releaseDate: row.releaseDate,
      });
    }
  }
  if (toSend.length === 0) return;

  const baseUrl = config.baseUrl;
  const tableRows = toSend
    .map(
      (r) =>
        `<tr>
          <td><a href="${baseUrl}/packages/${encodeURIComponent(r.name)}">${r.name}</a></td>
          <td>${r.installedVersion}</td>
          <td><strong>${r.upstreamVersion}</strong></td>
          <td>${r.releaseDate ? new Date(r.releaseDate).toISOString().slice(0, 10) : '-'}</td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <h2>${brand.productName}: Watched Package Update</h2>
    <p>${toSend.length} watched package(s) have new upstream versions available:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>Package</th><th>Installed</th><th>Latest</th><th>Released</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p><a href="${baseUrl}">Open Dashboard</a></p>
  `;
  const subject =
    toSend.length === 1
      ? `[${brand.productName}] ${toSend[0].name} ${toSend[0].upstreamVersion} is available`
      : `[${brand.productName}] ${toSend.length} watched packages have updates`;

  try {
    await sendMail(s.email, subject, html);
    for (const pkg of toSend) {
      await db.insert(schema.notifications).values({
        type: 'watched_update',
        recipient: s.email,
        subject,
        metadata: { packageName: pkg.name, upstreamVersion: pkg.upstreamVersion },
      });
    }
    logger.info({ count: toSend.length }, 'Watched package alert email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send watched package alert email');
  }
}

// -- Defer Expired Notification -----------------------------------------------

/**
 * Send a notification when packages have been automatically un-deferred
 * because their deferral period expired.
 */
export async function sendDeferExpiredNotification(packageNames: string[]): Promise<void> {
  if (packageNames.length === 0) return;
  const s = await getAlertSettings();
  if (!isSmtpConfigured(s.email)) return;

  const baseUrl = config.baseUrl;
  const rows = packageNames
    .map((name) => `<tr><td><a href="${baseUrl}/packages/${encodeURIComponent(name)}">${name}</a></td></tr>`)
    .join('\n');

  const html = `
    <h2>${brand.productName}: Deferred Packages Expired</h2>
    <p>${packageNames.length} deferred package(s) have had their deferral period expire and are now back in the update queue:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr><th>Package</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p><a href="${baseUrl}/updates">View updates on dashboard</a></p>
  `;
  const subject =
    packageNames.length === 1
      ? `[${brand.productName}] Deferred package expired: ${packageNames[0]}`
      : `[${brand.productName}] ${packageNames.length} deferred packages expired`;

  try {
    await sendMail(s.email, subject, html);
    await db.insert(schema.notifications).values({
      type: 'defer_expired',
      recipient: s.email,
      subject,
      metadata: { packageNames },
    });
    logger.info({ count: packageNames.length }, 'Defer expired notification sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send defer expired notification email');
  }
}

// -- Worker Failure Alert -----------------------------------------------------

/**
 * Send an email alert when a background worker exhausts all retries.
 * Deduplicates: sends at most once per 24 hours per worker.
 */
export async function sendWorkerFailureAlert(workerName: string, errorMessage: string): Promise<void> {
  const s = await getAlertSettings();
  if (!isSmtpConfigured(s.email)) return;

  // Don't re-send for the same worker within 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.type, 'worker_failure'),
        gte(schema.notifications.sentAt, cutoff),
        sql`json_extract(${schema.notifications.metadata}, '$.workerName') = ${workerName}`,
      ),
    )
    .limit(1);
  if (recent) return;

  const baseUrl = config.baseUrl;
  const html = `
    <h2>${brand.productName}: Worker Failure</h2>
    <p>The <strong>${workerName}</strong> worker has exhausted all retry attempts and stopped processing.</p>
    <h3>Error</h3>
    <pre style="background:#1a1a2e;color:#e0e0e0;padding:12px;border-radius:4px;overflow-x:auto;">${errorMessage}</pre>
    <p>The worker will resume on its next scheduled run. If this persists, check the server logs.</p>
    <p><a href="${baseUrl}/settings">View worker status on dashboard</a></p>
  `;
  const subject = `[${brand.productName}] Worker failed: ${workerName}`;

  try {
    await sendMail(s.email, subject, html);
    await db.insert(schema.notifications).values({
      type: 'worker_failure',
      recipient: s.email,
      subject,
      metadata: { workerName, errorMessage: errorMessage.slice(0, 500) },
    });
    logger.info({ workerName }, 'Worker failure alert email sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send worker failure alert email');
  }
}

// -- Test Email --------------------------------------------------------------

export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  const s = await getAlertSettings();
  if (!isSmtpConfigured(s.email)) {
    return { ok: false, error: 'SMTP not fully configured (check SMTP_USER, SMTP_PASS)' };
  }
  if (!s.email) {
    return { ok: false, error: 'No alert email address configured' };
  }
  try {
    await sendMail(
      s.email,
      `[${brand.productName}] Test email`,
      `<h2>${brand.productName} - Test Email</h2>
       <p>Email alerts are working correctly. This message was sent from <strong>${config.baseUrl}</strong>.</p>
       <p><a href="${config.baseUrl}/settings">Return to Settings</a></p>`,
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// -- Recent Notifications ----------------------------------------------------

export async function getRecentNotifications(limit = 20) {
  return db
    .select()
    .from(schema.notifications)
    .orderBy(desc(schema.notifications.sentAt))
    .limit(limit);
}
