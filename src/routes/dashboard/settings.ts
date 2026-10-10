import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { count, desc, eq, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { autoDetectUpstream } from '../../services/auto-detect-upstream.js';
import { getWorkerStatus, triggerWorker, getWorkerNames } from '../../workers/index.js';
import {
  getAlertSettings,
  saveAlertSetting,
  sendTestEmail,
  getRecentNotifications,
} from '../../services/notifications.js';
import { setSavedThemeCache } from '../../services/theme.js';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function settingsRoutes(app: FastifyInstance) {
  // -- Main settings page ----------------------------------------------------
  app.get('/settings', async (_request, reply) => {
    return reply.view('pages/settings.ejs', {
      ...(await buildSettingsContext()),
      alertSaved: false,
      alertError: null,
    });
  });

  // -- Save UI theme ----------------------------------------------------------
  app.post<{ Body: { theme?: string } }>('/settings/theme', async (request, reply) => {
    const themeId = (request.body.theme || 'default').replace(/[^a-z0-9_-]/gi, '');
    await db.insert(schema.settings)
      .values({ key: 'ui_theme', value: themeId as unknown, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: themeId as unknown, updatedAt: new Date() } });
    setSavedThemeCache(themeId);
    reply.code(204).send();
  });

  // -- Save email alert settings ---------------------------------------------
  app.post<{
    Body: {
      alert_email?: string;
      alert_cve_enabled?: string;
      alert_cve_min_cvss?: string;
      alert_unmapped_enabled?: string;
      alert_digest_enabled?: string;
      alert_staleness_enabled?: string;
      alert_staleness_min_score?: string;
      alert_watched_enabled?: string;
    };
  }>('/settings/alerts', async (request, reply) => {
    const b = request.body;
    const email = b.alert_email?.trim() || '';
    const minCvss = parseFloat(b.alert_cve_min_cvss || '7.0');
    const minScore = parseInt(b.alert_staleness_min_score || '20', 10);

    if (minCvss < 0 || minCvss > 10) {
      return reply.view('pages/settings.ejs', {
        ...(await buildSettingsContext()),
        alertError: 'Min CVSS must be between 0 and 10',
        alertSaved: false,
      });
    }

    await saveAlertSetting('alert_email', email);
    await saveAlertSetting('alert_cve_enabled', b.alert_cve_enabled === 'on' ? '1' : '0');
    await saveAlertSetting('alert_cve_min_cvss', String(minCvss));
    await saveAlertSetting('alert_unmapped_enabled', b.alert_unmapped_enabled === 'on' ? '1' : '0');
    await saveAlertSetting('alert_digest_enabled', b.alert_digest_enabled === 'on' ? '1' : '0');
    await saveAlertSetting('alert_staleness_enabled', b.alert_staleness_enabled === 'on' ? '1' : '0');
    await saveAlertSetting('alert_staleness_min_score', String(isNaN(minScore) ? 20 : minScore));
    await saveAlertSetting('alert_watched_enabled', b.alert_watched_enabled === 'on' ? '1' : '0');

    return reply.view('pages/settings.ejs', {
      ...(await buildSettingsContext()),
      alertSaved: true,
      alertError: null,
    });
  });

  // -- Send test email -------------------------------------------------------
  app.post('/settings/alerts/test', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    const result = await sendTestEmail();
    if (result.ok) {
      return reply.send(`<span class="badge badge-current">OK: Test email sent successfully</span>`);
    } else {
      return reply.send(`<span class="badge badge-critical">Error ${escHtml(result.error ?? 'Unknown error')}</span>`);
    }
  });

  // -- Trigger a server worker (session-authenticated) -----------------------
  app.post<{ Params: { name: string } }>(
    '/settings/workers/:name/trigger',
    async (request, reply) => {
      reply.header('Content-Type', 'text/html');
      const { name } = request.params;
      if (!getWorkerNames().includes(name)) {
        return reply.send(`<span class="badge badge-critical">Error: Unknown worker</span>`);
      }
      const ok = await triggerWorker(name);
      if (ok) {
        return reply.send(`<span class="badge badge-current">OK: queued</span>`);
      } else {
        return reply.send(`<span class="badge badge-critical">Error: not available</span>`);
      }
    },
  );

  // -- Trigger CVE resolver sweep -------------------------------------------
  app.post('/settings/resolve-cves', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    const ok = await triggerWorker('cve-resolver');
    if (ok) {
      return reply.send(`<pre class="workstation-output">CVE resolver job queued. Stale CVE links will be cleared momentarily.</pre>`);
    }
    return reply.send(`<pre class="workstation-output error">Failed to queue CVE resolver - worker not available.</pre>`);
  });

  // -- Trigger staleness scorer recalculation ------------------------------
  app.post('/settings/recalc-staleness', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    const ok = await triggerWorker('staleness-scorer');
    if (ok) {
      return reply.send(`<pre class="workstation-output">Staleness scorer job queued. Scores will be recalculated momentarily.</pre>`);
    }
    return reply.send(`<pre class="workstation-output error">Failed to queue staleness scorer - worker not available.</pre>`);
  });

  // -- Re-run upstream auto-detection for unmapped packages ------------------
  app.post('/settings/detect-upstream', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    try {
      const unmapped = await db
        .select({ name: schema.packages.name })
        .from(schema.packages)
        .leftJoin(
          schema.upstreamSources,
          eq(schema.upstreamSources.packageId, schema.packages.id),
        )
        .where(sql`${schema.upstreamSources.id} IS NULL AND ${schema.packages.removedAt} IS NULL`);

      const names = unmapped.map((r) => r.name);
      if (names.length === 0) {
        return reply.send(
          `<pre class="workstation-output">All packages already have an upstream source configured.</pre>`,
        );
      }
      await autoDetectUpstream(names);

      const stillUnmapped = await db
        .select({ name: schema.packages.name })
        .from(schema.packages)
        .leftJoin(
          schema.upstreamSources,
          eq(schema.upstreamSources.packageId, schema.packages.id),
        )
        .where(sql`${schema.upstreamSources.id} IS NULL AND ${schema.packages.removedAt} IS NULL`);

      const detected = names.length - stillUnmapped.length;
      const remaining = stillUnmapped.map((r) => r.name).sort().join(', ');
      const output =
        `Checked ${names.length} package(s) without an upstream source.\n` +
        `Detected sources for ${detected}.` +
        (remaining ? `\nStill unmapped: ${remaining}` : '');
      return reply.send(`<pre class="workstation-output">${escHtml(output)}</pre>`);
    } catch (err: any) {
      return reply.send(`<pre class="workstation-output error">${escHtml(err.message)}</pre>`);
    }
  });

  // -- Save CVE product alias ------------------------------------------------
  app.post<{ Body: { product: string; package: string } }>(
    '/settings/cve-alias',
    async (request, reply) => {
      const { product, package: pkgName } = request.body ?? {};
      if (!product || !pkgName) {
        return reply.redirect('/settings');
      }

      // Load existing user aliases, add the new one
      const [row] = await db
        .select({ value: schema.settings.value })
        .from(schema.settings)
        .where(eq(schema.settings.key, 'cve_product_aliases'))
        .limit(1);

      const aliases = (row?.value as Record<string, string>) ?? {};
      aliases[product.toLowerCase()] = pkgName;

      await db
        .insert(schema.settings)
        .values({ key: 'cve_product_aliases', value: aliases as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: aliases as any, updatedAt: new Date() },
        });

      // Remove from unmatched products
      await db
        .delete(schema.unmatchedCveProducts)
        .where(eq(schema.unmatchedCveProducts.productName, product.toLowerCase()));

      return reply.redirect('/settings');
    },
  );

  // -- Save staleness group multipliers --------------------------------------
  app.post<{ Body: Record<string, string> }>(
    '/settings/staleness-multipliers',
    async (request, reply) => {
      const body = request.body ?? {};
      const multipliers: Record<string, number> = {};
      for (const [key, val] of Object.entries(body)) {
        if (key.startsWith('mult_')) {
          const group = key.slice(5);
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 0 && num <= 5) {
            multipliers[group] = Math.round(num * 10) / 10;
          }
        }
      }

      await db
        .insert(schema.settings)
        .values({ key: 'staleness_group_multipliers', value: multipliers as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: multipliers as any, updatedAt: new Date() },
        });

      return reply.redirect('/settings');
    },
  );
}

async function buildSettingsContext() {
  const [pkgCount] = await db.select({ count: count() }).from(schema.packages);
  const [srcCount] = await db.select({ count: count() }).from(schema.upstreamSources);
  const [cveCount] = await db
    .select({ count: count() })
    .from(schema.vulnerabilities)
    .where(eq(schema.vulnerabilities.status, 'open'));
  const [lastPush] = await db
    .select({ pushedAt: schema.manifestPushes.pushedAt })
    .from(schema.manifestPushes)
    .orderBy(desc(schema.manifestPushes.pushedAt))
    .limit(1);
  const sourceBreakdown = await db
    .select({ sourceType: schema.upstreamSources.sourceType, count: count() })
    .from(schema.upstreamSources)
    .groupBy(schema.upstreamSources.sourceType);
  const recentChecks = await db
    .select({
      sourceType: schema.upstreamSources.sourceType,
      lastChecked: sql<string>`max(${schema.upstreamSources.lastChecked})`,
    })
    .from(schema.upstreamSources)
    .where(sql`${schema.upstreamSources.lastChecked} IS NOT NULL`)
    .groupBy(schema.upstreamSources.sourceType);
  const workers = getWorkerStatus();
  const alertSettings = await getAlertSettings();
  const recentNotifications = await getRecentNotifications(15);

  // Unmatched CVE products
  const unmatchedProducts = await db
    .select()
    .from(schema.unmatchedCveProducts)
    .orderBy(desc(schema.unmatchedCveProducts.cveCount))
    .limit(50);

  // Staleness group multipliers
  const [multipliersRow] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, 'staleness_group_multipliers'))
    .limit(1);
  const groupMultipliers = (multipliersRow?.value as Record<string, number>) ?? {
    toolchain: 1.0, kde: 1.0, core: 1.0, apps: 1.0, security: 1.0,
  };

  // Package names for autocomplete in alias mapping
  const packageNames = await db
    .select({ name: schema.packages.name })
    .from(schema.packages)
    .orderBy(schema.packages.name);

  return {
    title: 'Settings',
    stats: {
      packageCount: pkgCount.count,
      sourceCount: srcCount.count,
      openCveCount: cveCount.count,
      lastPush: lastPush?.pushedAt ?? null,
    },
    sourceBreakdown,
    recentChecks,
    workers,
    apiKeyId: config.api.keyId,
    alertSettings,
    recentNotifications,
    smtpConfigured: !!(config.smtp.user && config.smtp.pass),
    unmatchedProducts,
    groupMultipliers,
    packageNames: packageNames.map(p => p.name),
  };
}
