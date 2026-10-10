import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { sendWorkerFailureAlert } from '../services/notifications.js';
import { processGithubRelease } from './github-release.js';
import { processKernelRelease } from './kernel-release.js';
import { processArchSecurity } from './arch-security.js';
import { processNvdCve } from './nvd-cve.js';
import { processOsvCve } from './osv-cve.js';
import { processDigestMailer } from './digest-mailer.js';
import { processKdeRelease } from './kde-release.js';
import { processGnuRelease } from './gnu-release.js';
import { processPypiRelease } from './pypi-release.js';
import { processGitlabRelease } from './gitlab-release.js';
import { processGenericRelease } from './generic-release.js';
import { processFlathubRelease } from './flathub-release.js';
import { processStalenessScorer } from './staleness-scorer.js';
import { processCveResolver } from './cve-resolver.js';
import { processBLFSErrata } from './blfs-errata.js';
import { processDbRetention } from './db-retention.js';

interface WorkerDef {
  name: string;
  processor: () => Promise<void>;
  cron: string;
  enabled: boolean;
}

const workerDefs: WorkerDef[] = [
  { name: 'github-release', processor: processGithubRelease, cron: '0 */4 * * *', enabled: true }, // every 4 hours
  { name: 'kernel-release', processor: processKernelRelease, cron: '15 */2 * * *', enabled: true }, // every 2 hours at :15
  { name: 'arch-security', processor: processArchSecurity, cron: '30 * * * *', enabled: true }, // every hour at :30
  { name: 'nvd-cve', processor: processNvdCve, cron: '0 */2 * * *', enabled: true }, // every 2 hours
  { name: 'osv-cve', processor: processOsvCve, cron: '30 */4 * * *', enabled: true }, // every 4 hours at :30
  { name: 'digest-mailer', processor: processDigestMailer, cron: '0 8 * * 0', enabled: true }, // Sunday 8am
  { name: 'kde-release', processor: processKdeRelease, cron: '30 */6 * * *', enabled: true }, // every 6 hours at :30
  { name: 'gnu-release', processor: processGnuRelease, cron: '45 */6 * * *', enabled: true }, // every 6 hours at :45
  { name: 'pypi-release', processor: processPypiRelease, cron: '0 */8 * * *', enabled: true }, // every 8 hours
  { name: 'gitlab-release', processor: processGitlabRelease, cron: '15 */4 * * *', enabled: true }, // every 4 hours at :15
  { name: 'generic-release', processor: processGenericRelease, cron: '0 */12 * * *', enabled: true }, // every 12 hours
  { name: 'flathub-release', processor: processFlathubRelease, cron: '30 */6 * * *', enabled: true }, // every 6 hours at :30
  { name: 'staleness-scorer', processor: processStalenessScorer, cron: '0 * * * *', enabled: true }, // every hour
  { name: 'cve-resolver', processor: processCveResolver, cron: '45 */2 * * *', enabled: true }, // every 2 hours at :45
  { name: 'blfs-errata', processor: processBLFSErrata, cron: '0 */12 * * *', enabled: true }, // every 12 hours
  { name: 'db-retention', processor: processDbRetention, cron: '0 4 * * *', enabled: true }, // daily at 4am UTC
];

// Per-worker run status, persisted to the settings table so the overview
// worker-status card survives restarts.
interface WorkerRunStatus {
  lastCompleted: string | null;
  lastFailed: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const STATUS_KEY = (name: string) => `worker_status:${name}`;

const activeJobs = new Map<string, Cron>();
const statusMap = new Map<string, WorkerRunStatus>();
const inFlight = new Set<string>();

function blankStatus(): WorkerRunStatus {
  return { lastCompleted: null, lastFailed: null, lastError: null, consecutiveFailures: 0 };
}

async function loadStatus(name: string): Promise<WorkerRunStatus> {
  if (statusMap.has(name)) return statusMap.get(name)!;
  try {
    const [row] = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, STATUS_KEY(name)))
      .limit(1);
    const status = row?.value
      ? { ...blankStatus(), ...(row.value as Partial<WorkerRunStatus>) }
      : blankStatus();
    statusMap.set(name, status);
    return status;
  } catch {
    const status = blankStatus();
    statusMap.set(name, status);
    return status;
  }
}

async function persistStatus(name: string, status: WorkerRunStatus): Promise<void> {
  statusMap.set(name, status);
  try {
    await db
      .insert(schema.settings)
      .values({ key: STATUS_KEY(name), value: status, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: status, updatedAt: new Date() },
      });
  } catch (err) {
    logger.error({ err, worker: name }, 'Failed to persist worker status');
  }
}

/**
 * Run a worker's processor once, recording timing + outcome and firing a
 * failure alert on throw. Skips if the same worker is already running.
 */
async function runProcessor(def: WorkerDef): Promise<void> {
  if (inFlight.has(def.name)) {
    logger.warn({ worker: def.name }, 'Worker already running, skipping overlapping run');
    return;
  }
  inFlight.add(def.name);
  const start = Date.now();
  logger.info({ worker: def.name }, 'Worker job started');
  const status = await loadStatus(def.name);
  try {
    await def.processor();
    const finishedAt = new Date().toISOString();
    logger.info({ worker: def.name, durationMs: Date.now() - start }, 'Worker job completed');
    await persistStatus(def.name, {
      ...status,
      lastCompleted: finishedAt,
      consecutiveFailures: 0,
    });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ worker: def.name, err, durationMs: Date.now() - start }, 'Worker job failed');
    const consecutiveFailures = (status.consecutiveFailures ?? 0) + 1;
    await persistStatus(def.name, {
      ...status,
      lastFailed: finishedAt,
      lastError: message.slice(0, 300),
      consecutiveFailures,
    });
    sendWorkerFailureAlert(def.name, message).catch((e) =>
      logger.error({ err: e }, 'Failed to send worker failure alert'),
    );
  } finally {
    inFlight.delete(def.name);
  }
}

export async function startWorkers(): Promise<void> {
  for (const def of workerDefs) {
    if (!def.enabled) continue;
    await loadStatus(def.name);

    const job = new Cron(def.cron, { name: def.name, protect: true }, () => {
      void runProcessor(def);
    });

    activeJobs.set(def.name, job);
    logger.info({ worker: def.name, cron: def.cron }, 'Worker registered');
  }
}

export async function stopWorkers(): Promise<void> {
  for (const job of activeJobs.values()) {
    job.stop();
  }
  activeJobs.clear();
  logger.info('All workers stopped');
}

export function getWorkerStatus(): { name: string; cron: string; enabled: boolean }[] {
  return workerDefs.map((d) => ({ name: d.name, cron: d.cron, enabled: d.enabled }));
}

export interface WorkerHealthInfo {
  name: string;
  cron: string;
  enabled: boolean;
  lastCompleted: string | null;
  lastFailed: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  jobCounts: Record<string, number> | null;
}

export async function getWorkerHealth(): Promise<WorkerHealthInfo[]> {
  const results: WorkerHealthInfo[] = [];
  for (const def of workerDefs) {
    const status = await loadStatus(def.name);
    results.push({
      name: def.name,
      cron: def.cron,
      enabled: def.enabled,
      lastCompleted: status.lastCompleted,
      lastFailed: status.lastFailed,
      lastError: status.lastError,
      consecutiveFailures: status.consecutiveFailures,
      jobCounts: null,
    });
  }
  return results;
}

export function getWorkerNames(): string[] {
  return workerDefs.filter((d) => d.enabled).map((d) => d.name);
}

/**
 * Fire a worker immediately (fire-and-forget; does not block the caller/HTTP
 * reply). Returns false only if the worker name is unknown or disabled.
 */
export async function triggerWorker(workerName: string): Promise<boolean> {
  const def = workerDefs.find((d) => d.name === workerName && d.enabled);
  if (!def) return false;
  void runProcessor(def);
  return true;
}
