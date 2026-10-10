import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { count, desc, eq, sql } from 'drizzle-orm';
import { getWorkerHealth } from '../../workers/index.js';
import { config } from '../../config.js';
import { fmtDate, fmtDateTime } from '../../utils/dates.js';
import { resolve } from 'path';
import ejs from 'ejs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// -- Dashboard Configuration ------------------------------------------------

interface DashboardCardConfig {
  id: string;
  visible: boolean;
  order: number;
  width?: 'full' | 'half';  // grid span: full = 2 cols, half = 1 col
  maxHeight?: number;        // px, 0 = auto (no limit)
  itemCount?: number;
}

interface DashboardConfig {
  cards: DashboardCardConfig[];
  version: number;
}

// Card metadata for the configure modal
const CARD_META: Record<string, { label: string; hasItemCount: boolean; defaultItemCount?: number; defaultWidth: 'full' | 'half'; description: string }> = {
  'stat-strip':            { label: 'Status Strip',          hasItemCount: false, defaultWidth: 'full', description: 'Top row of stat badges' },
  'active-batch':          { label: 'Active Batch',          hasItemCount: false, defaultWidth: 'full', description: 'Current batch progress (if any)' },
  'recently-added':        { label: 'Recently Added',        hasItemCount: true, defaultItemCount: 5,  defaultWidth: 'half', description: 'Newest packages by first seen' },
  'recent-activity':       { label: 'Recent Activity',       hasItemCount: true, defaultItemCount: 5,  defaultWidth: 'half', description: 'Latest activity events' },
  'packages-summary':      { label: 'Packages',              hasItemCount: false, defaultWidth: 'half', description: 'Package stats summary' },
  'most-outdated':         { label: 'Most Outdated',         hasItemCount: true, defaultItemCount: 5,  defaultWidth: 'half', description: 'Top packages by staleness' },
  'recent-notifications':  { label: 'Recent Notifications',  hasItemCount: true, defaultItemCount: 5,  defaultWidth: 'half', description: 'Latest email alerts' },
  'staleness-trend':       { label: 'Staleness Trend',       hasItemCount: true, defaultItemCount: 30, defaultWidth: 'half', description: 'ECharts chart: outdated, score, CVEs over time' },
  'watched-packages':      { label: 'Watched Packages',      hasItemCount: true, defaultItemCount: 10, defaultWidth: 'half', description: 'Starred packages with staleness scores' },
  'worker-status':         { label: 'Worker Status',         hasItemCount: false, defaultWidth: 'full', description: 'Monitored workers with last-run times' },
  'cve-severity-breakdown':{ label: 'CVE Breakdown',         hasItemCount: false, defaultWidth: 'half', description: 'Open CVEs by severity' },
  'upstream-coverage':     { label: 'Upstream Coverage',     hasItemCount: false, defaultWidth: 'half', description: 'Monitored vs unmonitored packages' },
};

const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  version: 2,
  cards: [
    { id: 'stat-strip',            visible: true,  order: 0,  width: 'full' },
    { id: 'active-batch',          visible: true,  order: 1,  width: 'full' },
    { id: 'recently-added',        visible: true,  order: 2,  width: 'half', itemCount: 5 },
    { id: 'recent-activity',       visible: true,  order: 3,  width: 'half', itemCount: 5 },
    { id: 'packages-summary',      visible: true,  order: 4,  width: 'half' },
    { id: 'most-outdated',         visible: true,  order: 5,  width: 'half', itemCount: 5 },
    { id: 'recent-notifications',  visible: true,  order: 6,  width: 'half', itemCount: 5 },
    { id: 'staleness-trend',       visible: true,  order: 7,  width: 'half', itemCount: 30 },
    { id: 'watched-packages',      visible: true,  order: 8,  width: 'half', itemCount: 10 },
    { id: 'worker-status',         visible: false, order: 9,  width: 'full' },
    { id: 'cve-severity-breakdown',visible: false, order: 10, width: 'half' },
    { id: 'upstream-coverage',     visible: false, order: 11, width: 'half' },
  ],
};

async function loadDashboardConfig(): Promise<DashboardConfig> {
  try {
    const [row] = await db.select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, 'dashboard_config'))
      .limit(1);
    if (row?.value) {
      return mergeDashboardConfig(migrateConfig(row.value as DashboardConfig));
    }
  } catch { /* use default */ }
  return structuredClone(DEFAULT_DASHBOARD_CONFIG);
}

function mergeDashboardConfig(saved: DashboardConfig): DashboardConfig {
  const knownIds = new Set(saved.cards.map(c => c.id));
  const merged = [...saved.cards];
  let maxOrder = Math.max(...saved.cards.map(c => c.order), -1);
  for (const def of DEFAULT_DASHBOARD_CONFIG.cards) {
    if (!knownIds.has(def.id)) {
      merged.push({ ...def, order: ++maxOrder, visible: false });
    }
  }
  return { ...saved, cards: merged };
}

function getItemCount(cfg: DashboardConfig, cardId: string): number {
  const card = cfg.cards.find(c => c.id === cardId);
  const meta = CARD_META[cardId];
  const raw = card?.itemCount ?? meta?.defaultItemCount ?? 5;
  return Math.max(1, Math.min(50, raw));
}

function isVisible(cfg: DashboardConfig, cardId: string): boolean {
  const card = cfg.cards.find(c => c.id === cardId);
  if (card) return card.visible;
  return false;
}

function getCardWidth(cfg: DashboardConfig, cardId: string): 'full' | 'half' {
  const card = cfg.cards.find(c => c.id === cardId);
  return card?.width ?? CARD_META[cardId]?.defaultWidth ?? 'full';
}

/** Drop any saved card ids that are no longer part of the dashboard. */
function migrateConfig(cfg: DashboardConfig): DashboardConfig {
  const knownIds = new Set(Object.keys(CARD_META));
  const cards = cfg.cards.filter(c => knownIds.has(c.id));
  return { version: 2, cards };
}

// -- Main Data Loader -------------------------------------------------------

async function getOverviewData(dashCfg: DashboardConfig) {
    const vis = (id: string) => isVisible(dashCfg, id);

    // -- Always needed (stat strip uses these) --
    const [pkgCount] = await db.select({ count: count() }).from(schema.packages);

    const [outdatedResult] = await db.execute(sql`
      SELECT count(DISTINCT ur.package_id) AS count
      FROM upstream_releases ur
      WHERE ur.is_newer = true
        AND ur.package_id NOT IN (
          SELECT id FROM packages WHERE pinned_at IS NOT NULL OR deferred_at IS NOT NULL OR removed_at IS NOT NULL
        )
    `);

    const [openCveResult] = await db
      .select({ count: count() })
      .from(schema.vulnerabilities)
      .where(sql`${schema.vulnerabilities.status} = 'open' AND EXISTS (SELECT 1 FROM package_vulnerabilities pv WHERE pv.vulnerability_id = ${schema.vulnerabilities.id})`);

    const [deferredResult] = await db.execute(sql`
      SELECT count(*) AS count FROM packages WHERE deferred_at IS NOT NULL
    `);

    const [tierBreakdown] = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE score >= 25) AS critical,
        count(*) FILTER (WHERE score >= 15 AND score < 25) AS high,
        count(*) FILTER (WHERE score >= 5 AND score < 15) AS medium,
        count(*) FILTER (WHERE score > 0 AND score < 5) AS low
      FROM staleness_scores ss
      JOIN packages p ON ss.package_id = p.id
      WHERE p.deferred_at IS NULL AND p.pinned_at IS NULL AND p.removed_at IS NULL
    `);

    const [lastPush] = await db
      .select()
      .from(schema.manifestPushes)
      .orderBy(desc(schema.manifestPushes.pushedAt))
      .limit(1);

    // -- Conditional: Recent activity --
    const recentActivity = vis('recent-activity')
      ? await db.select().from(schema.activityEvents).orderBy(desc(schema.activityEvents.createdAt)).limit(getItemCount(dashCfg, 'recent-activity'))
      : [];

    // -- Conditional: Most outdated --
    const mostOutdated = vis('most-outdated')
      ? await db
          .select({
            name: schema.packages.name,
            version: schema.packages.version,
            score: schema.stalenessScores.score,
            daysBehind: schema.stalenessScores.daysBehind,
            versionsBehind: schema.stalenessScores.versionsBehind,
          })
          .from(schema.stalenessScores)
          .innerJoin(schema.packages, eq(schema.stalenessScores.packageId, schema.packages.id))
          .where(sql`${schema.packages.deferredAt} IS NULL AND ${schema.packages.pinnedAt} IS NULL AND ${schema.packages.removedAt} IS NULL AND ${schema.stalenessScores.score} > 0`)
          .orderBy(desc(schema.stalenessScores.score))
          .limit(getItemCount(dashCfg, 'most-outdated'))
      : [];

    // -- Conditional: Recent notifications --
    const recentNotifications = vis('recent-notifications')
      ? await db.select({ type: schema.notifications.type, subject: schema.notifications.subject, sentAt: schema.notifications.sentAt })
          .from(schema.notifications).orderBy(desc(schema.notifications.sentAt)).limit(getItemCount(dashCfg, 'recent-notifications'))
      : [];

    // -- VPS health (always needed for stat strip) --
    const loadavg = os.loadavg();
    const totalmem = os.totalmem();
    const freemem = os.freemem();
    const uptime = os.uptime();
    const usedMem = totalmem - freemem;
    const memPct = Math.round((usedMem / totalmem) * 100);
    const toGiB = (b: number) => (b / 1024 / 1024 / 1024).toFixed(1);
    const uptimeDays = Math.floor(uptime / 86400);
    const uptimeHours = Math.floor((uptime % 86400) / 3600);
    const uptimeStr = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours}h` : `${uptimeHours}h`;

    let diskUsed = '-';
    let diskTotal = '-';
    let diskPct = '-';
    try {
      const { stdout } = await execFileAsync('df', ['-h', '/'], { timeout: 5000 });
      const row = stdout.trim().split('\n')[1]?.split(/\s+/) ?? [];
      diskUsed = row[2] ?? '?';
      diskTotal = row[1] ?? '?';
      diskPct = row[4] ?? '?';
    } catch { /* ignore */ }

    let vpsUpdatesCount = 0;
    try {
      const { stdout } = await execFileAsync('apt', ['list', '--upgradable'], { timeout: 10000 });
      vpsUpdatesCount = stdout.split('\n').filter((l) => l && !l.startsWith('Listing')).length;
    } catch { /* ignore */ }

    const [advisoryResult] = await db.execute(sql`
      SELECT count(*) AS count FROM advisories WHERE resolved_at IS NULL
    `);

    // -- Conditional: Staleness trend --
    const stalenessTrendRaw = vis('staleness-trend')
      ? await db.select().from(schema.stalenessHistory).orderBy(desc(schema.stalenessHistory.snapshotDate)).limit(getItemCount(dashCfg, 'staleness-trend'))
      : [];

    // -- Upstream coverage (always needed for stat strip) --
    const [coverageResult] = await db.execute(sql`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE id IN (SELECT DISTINCT package_id FROM upstream_sources)) AS covered
      FROM packages
      WHERE removed_at IS NULL
    `);
    const totalPkgs = Number((coverageResult as any).total) || 0;
    const coveredPkgs = Number((coverageResult as any).covered) || 0;
    const coveragePct = totalPkgs > 0 ? Math.round((coveredPkgs / totalPkgs) * 100) : 0;

    // -- Conditional: Upstream by type --
    let upstreamByType: { type: string; count: number }[] = [];
    if (vis('upstream-coverage')) {
      const rows = await db.execute(sql`
        SELECT source_type AS type, count(DISTINCT package_id) AS count
        FROM upstream_sources
        GROUP BY source_type
        ORDER BY count DESC
      `);
      upstreamByType = (rows as any[]).map(r => ({ type: r.type, count: Number(r.count) }));
    }

    // -- Conditional: Recently added packages --
    const recentPackages = vis('recently-added')
      ? await db.select({ name: schema.packages.name, version: schema.packages.version, firstSeen: schema.packages.firstSeen, groups: schema.packages.groups })
          .from(schema.packages).where(sql`${schema.packages.removedAt} IS NULL`).orderBy(desc(schema.packages.firstSeen)).limit(getItemCount(dashCfg, 'recently-added'))
      : [];

    // -- Active batch --
    const [activeBatch] = await db
      .select({ id: schema.updateBatches.id, name: schema.updateBatches.name, status: schema.updateBatches.status })
      .from(schema.updateBatches)
      .where(sql`${schema.updateBatches.status} IN ('in_progress', 'planned')`)
      .orderBy(desc(schema.updateBatches.createdAt))
      .limit(1);

    let activeBatchData = null;
    if (activeBatch) {
      const [batchCounts] = await db.execute(sql`
        SELECT count(*) AS total, count(*) FILTER (WHERE status = 'completed') AS completed
        FROM batch_items WHERE batch_id = ${activeBatch.id}
      `);
      const bTotal = Number((batchCounts as any).total) || 0;
      const bCompleted = Number((batchCounts as any).completed) || 0;
      const [nextItem] = await db
        .select({ name: schema.packages.name })
        .from(schema.batchItems)
        .innerJoin(schema.packages, eq(schema.batchItems.packageId, schema.packages.id))
        .where(sql`${schema.batchItems.batchId} = ${activeBatch.id} AND ${schema.batchItems.status} = 'pending'`)
        .orderBy(schema.batchItems.buildOrder)
        .limit(1);
      activeBatchData = { id: activeBatch.id, name: activeBatch.name, status: activeBatch.status, totalItems: bTotal, completedItems: bCompleted, nextPackage: nextItem?.name ?? null };
    }

    // -- Conditional: Watched packages --
    let watchedPackages: { name: string; version: string; score: number }[] = [];
    if (vis('watched-packages')) {
      watchedPackages = await db.execute(sql`
        SELECT p.name, p.version, COALESCE(ss.score, 0) AS score
        FROM packages p
        LEFT JOIN staleness_scores ss ON ss.package_id = p.id
        WHERE p.watched_at IS NOT NULL AND p.removed_at IS NULL
        ORDER BY ss.score DESC NULLS LAST
        LIMIT ${getItemCount(dashCfg, 'watched-packages')}
      `) as any[];
    }

    // -- Conditional: Worker health --
    let workerHealth: any[] = [];
    if (vis('worker-status')) {
      workerHealth = await getWorkerHealth();
    }

    // -- Conditional: CVE severity breakdown --
    let cveSeverity = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    if (vis('cve-severity-breakdown')) {
      const [row] = await db.execute(sql`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE cvss_score >= 9.0) AS critical,
          count(*) FILTER (WHERE cvss_score >= 7.0 AND cvss_score < 9.0) AS high,
          count(*) FILTER (WHERE cvss_score >= 4.0 AND cvss_score < 7.0) AS medium,
          count(*) FILTER (WHERE cvss_score < 4.0 OR cvss_score IS NULL) AS low
        FROM vulnerabilities
        WHERE status = 'open' AND EXISTS (SELECT 1 FROM package_vulnerabilities pv WHERE pv.vulnerability_id = vulnerabilities.id)
      `);
      if (row) {
        cveSeverity = {
          total: Number((row as any).total) || 0,
          critical: Number((row as any).critical) || 0,
          high: Number((row as any).high) || 0,
          medium: Number((row as any).medium) || 0,
          low: Number((row as any).low) || 0,
        };
      }
    }

    return {
      packageCount: pkgCount.count,
      outdatedCount: Number((outdatedResult as any).count) || 0,
      openCveCount: openCveResult.count,
      deferredCount: Number((deferredResult as any).count) || 0,
      stalenessTiers: {
        critical: Number((tierBreakdown as any).critical) || 0,
        high: Number((tierBreakdown as any).high) || 0,
        medium: Number((tierBreakdown as any).medium) || 0,
        low: Number((tierBreakdown as any).low) || 0,
      },
      lastPush: lastPush ?? null,
      advisoryCount: Number((advisoryResult as any).count) || 0,
      stalenessTrend: stalenessTrendRaw.reverse(),
      recentActivity,
      mostOutdated,
      recentNotifications,
      coverage: { total: totalPkgs, covered: coveredPkgs, pct: coveragePct, unmonitored: totalPkgs - coveredPkgs },
      upstreamByType,
      recentPackages,
      activeBatch: activeBatchData,
      watchedPackages,
      workerHealth,
      cveSeverity,
      vps: {
        load1m: loadavg[0].toFixed(2), memUsed: toGiB(usedMem), memTotal: toGiB(totalmem),
        memPct, uptime: uptimeStr, diskUsed, diskTotal, diskPct, updatesCount: vpsUpdatesCount,
      },
    };
}

// -- Routes -----------------------------------------------------------------

export async function overviewRoutes(app: FastifyInstance) {
  app.get('/overview', async (_request, reply) => {
    const dashCfg = await loadDashboardConfig();
    const data = await getOverviewData(dashCfg);
    const navExtra = `
      <span style="display:inline-flex;align-items:center;gap:0.35rem;margin-left:0.5rem;">
        <button onclick="enterArrangeMode()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.72rem;padding:0.2rem 0.5rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
          Arrange</button>
        <button onclick="openDashboardConfig()" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.72rem;padding:0.2rem 0.5rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configure</button>
      </span>`;
    return reply.view('pages/overview.ejs', {
      title: 'Overview',
      subtitle: '',
      navSection: 'overview',
      navExtra,
      dashboardConfig: dashCfg,
      cardMeta: CARD_META,
      ...data,
    });
  });

  app.get('/partials/overview-content', async (_request, reply) => {
    const dashCfg = await loadDashboardConfig();
    const data = await getOverviewData(dashCfg);
    const viewsDir = resolve(config.projectRoot, 'src', 'views');
    const html = await ejs.renderFile(
      resolve(viewsDir, 'partials', 'overview-content.ejs'),
      { ...data, dashboardConfig: dashCfg, cardMeta: CARD_META, fmtDate, fmtDateTime },
    );
    return reply.type('text/html').send(html);
  });

  // Save dashboard configuration
  app.post('/overview/config', async (request, reply) => {
    const body = request.body as { cards: DashboardCardConfig[] };
    if (!Array.isArray(body?.cards)) {
      return reply.code(400).send({ error: 'Invalid config' });
    }
    const knownIds = new Set(Object.keys(CARD_META));
    const cards = body.cards
      .filter(c => knownIds.has(c.id))
      .map((c, i) => ({
        id: c.id,
        visible: !!c.visible,
        order: typeof c.order === 'number' ? c.order : i,
        width: (c.width === 'half' ? 'half' : c.width === 'full' ? 'full' : CARD_META[c.id]?.defaultWidth ?? 'full') as 'full' | 'half',
        ...(typeof c.maxHeight === 'number' && c.maxHeight > 0
          ? { maxHeight: Math.min(2000, c.maxHeight) }
          : {}),
        ...(CARD_META[c.id]?.hasItemCount && typeof c.itemCount === 'number'
          ? { itemCount: Math.max(1, Math.min(50, c.itemCount)) }
          : {}),
      }));
    const cfg: DashboardConfig = { version: 2, cards };
    await db.insert(schema.settings)
      .values({ key: 'dashboard_config', value: cfg as any, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: cfg as any, updatedAt: new Date() } });
    reply.code(204).send();
  });

  // Reset to defaults
  app.post('/overview/config/reset', async (_request, reply) => {
    await db.delete(schema.settings).where(eq(schema.settings.key, 'dashboard_config'));
    reply.code(204).send();
  });
}
