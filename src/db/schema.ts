import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Timestamp columns are stored as integer unix-milliseconds (mode:
// 'timestamp_ms') so values returned from raw SQL are directly compatible with
// `new Date(ms)` in templates. `unixepoch() * 1000` supplies ms defaults; raw
// interval comparisons therefore use ms constants (e.g. days * 86400000).
const now = sql`(unixepoch() * 1000)`;

// -- Packages (populated from manifest pushes) --

export const packages = sqliteTable('packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  version: text('version').notNull(),
  description: text('description').default(''),
  architecture: text('architecture').default('x86_64'),
  depends: text('depends', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  provides: text('provides', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  groups: text('groups', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  buildDate: integer('build_date', { mode: 'timestamp_ms' }),
  installDate: integer('install_date', { mode: 'timestamp_ms' }),
  firstSeen: integer('first_seen', { mode: 'timestamp_ms' }).notNull().default(now),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }).notNull().default(now),
  removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
  pinnedAt: integer('pinned_at', { mode: 'timestamp_ms' }),
  pinReason: text('pin_reason'),
  deferredAt: integer('deferred_at', { mode: 'timestamp_ms' }),
  deferReason: text('defer_reason'),
  deferDays: integer('defer_days'),
  watchedAt: integer('watched_at', { mode: 'timestamp_ms' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default(sql`'{}'`),
}, (table) => [
  index('idx_packages_removed_at').on(table.removedAt),
]);

// -- Manifest Pushes (audit trail) --

export const manifestPushes = sqliteTable('manifest_pushes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pushedAt: integer('pushed_at', { mode: 'timestamp_ms' }).notNull().default(now),
  sourceIp: text('source_ip'),
  packageCount: integer('package_count').notNull(),
  packagesAdded: text('packages_added', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  packagesRemoved: text('packages_removed', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  packagesUpdated: text('packages_updated', { mode: 'json' }).$type<Record<string, { from: string; to: string }>>().default(sql`'{}'`),
  rawManifest: text('raw_manifest', { mode: 'json' }),
}, (table) => [
  index('idx_manifest_pushes_pushed_at').on(table.pushedAt),
]);

// -- Upstream Sources (how to check each package) --

export const upstreamSources = sqliteTable('upstream_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(), // github, gitlab, kernel, kde, gnu, pypi, generic
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  checkInterval: integer('check_interval').notNull().default(14400), // seconds, default 4h
  lastChecked: integer('last_checked', { mode: 'timestamp_ms' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  index('idx_upstream_sources_package').on(table.packageId),
  index('idx_upstream_sources_type').on(table.sourceType),
]);

// -- Upstream Releases (discovered versions) --

export const upstreamReleases = sqliteTable('upstream_releases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  sourceId: integer('source_id').notNull().references(() => upstreamSources.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  releaseDate: integer('release_date', { mode: 'timestamp_ms' }),
  releaseNotes: text('release_notes'),
  releaseUrl: text('release_url'),
  isNewer: integer('is_newer', { mode: 'boolean' }).notNull().default(false),
  discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  index('idx_upstream_releases_package').on(table.packageId),
  uniqueIndex('idx_upstream_releases_unique').on(table.packageId, table.sourceId, table.version),
]);

// -- Vulnerabilities (CVEs and security advisories) --

export const vulnerabilities = sqliteTable('vulnerabilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cveId: text('cve_id').notNull().unique(),
  title: text('title'),
  description: text('description'),
  severity: text('severity'), // critical, high, medium, low, none
  cvssScore: real('cvss_score'),
  source: text('source').notNull(), // nvd, osv, arch, blfs
  sourceUrl: text('source_url'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  fixedVersion: text('fixed_version'),
  status: text('status').notNull().default('open'), // open, dismissed, fixed
  dismissedReason: text('dismissed_reason'),
  ecosystem: text('ecosystem'), // source-reported ecosystem: Linux, RubyGems, PyPI, npm, ...
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  index('idx_vulnerabilities_status').on(table.status),
  index('idx_vulnerabilities_severity').on(table.severity),
]);

// -- Package <-> Vulnerability junction --

export const packageVulnerabilities = sqliteTable('package_vulnerabilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  vulnerabilityId: integer('vulnerability_id').notNull().references(() => vulnerabilities.id, { onDelete: 'cascade' }),
  matchConfidence: text('match_confidence').notNull().default('exact'), // exact, fuzzy, manual
  affectedStart: text('affected_start'),
  affectedEndExcluding: text('affected_end_excluding'),
  affectedEndIncluding: text('affected_end_including'),
  matchSource: text('match_source'),    // nvd | osv | arch | blfs | manual
  matchReason: text('match_reason'),                       // human-readable rationale
  ecosystem: text('ecosystem'),         // source ecosystem (Linux, RubyGems, ...)
  needsTriage: integer('needs_triage', { mode: 'boolean' }).notNull().default(false), // confirmed affected vs. unverified name match
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  uniqueIndex('idx_pkg_vuln_unique').on(table.packageId, table.vulnerabilityId),
  index('idx_pkg_vuln_package').on(table.packageId),
  index('idx_pkg_vuln_needs_triage').on(table.needsTriage),
]);

// -- Dependency Edges (built from package depends data) --

export const dependencyEdges = sqliteTable('dependency_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  dependsOnId: integer('depends_on_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  dependencyType: text('dependency_type').notNull().default('runtime'), // runtime, build
}, (table) => [
  uniqueIndex('idx_dep_edges_unique').on(table.packageId, table.dependsOnId, table.dependencyType),
  index('idx_dep_edges_package').on(table.packageId),
  index('idx_dep_edges_depends_on').on(table.dependsOnId),
]);

// -- Staleness Scores (computed periodically) --

export const stalenessScores = sqliteTable('staleness_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }).unique(),
  score: real('score').notNull().default(0),
  versionsBehind: integer('versions_behind').notNull().default(0),
  daysBehind: integer('days_behind').notNull().default(0),
  hasCve: integer('has_cve', { mode: 'boolean' }).notNull().default(false),
  maxCvss: real('max_cvss').default(0),
  computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- Update Batches --

export const updateBatches = sqliteTable('update_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planned'), // planned, in_progress, completed
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
});

export const batchItems = sqliteTable('batch_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  batchId: integer('batch_id').notNull().references(() => updateBatches.id, { onDelete: 'cascade' }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  fromVersion: text('from_version').notNull(),
  toVersion: text('to_version').notNull(),
  buildOrder: integer('build_order').notNull().default(0),
  status: text('status').notNull().default('pending'), // pending, completed
});

// -- Notifications (email send log) --

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // cve_alert, digest_weekly, digest_monthly
  recipient: text('recipient').notNull(),
  subject: text('subject').notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }).notNull().default(now),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default(sql`'{}'`),
}, (table) => [
  index('idx_notifications_type').on(table.type),
]);

// -- Book Versions (LFS/BLFS recommended) --
// NOTE: This table is currently unused. Originally intended for LFS/BLFS book version tracking.

export const bookVersions = sqliteTable('book_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageName: text('package_name').notNull(),
  bookVersion: text('book_version').notNull(),
  book: text('book').notNull(), // lfs, blfs
  section: text('section'),
  url: text('url'),
  checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  uniqueIndex('idx_book_versions_unique').on(table.packageName, table.book),
]);

// -- Knowledge Base Documents --

export const kbDocuments = sqliteTable('kb_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- KB Document <-> Package junction --

export const kbDocumentPackages = sqliteTable('kb_document_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('idx_kb_doc_pkg_unique').on(table.documentId, table.packageId),
]);

// -- Advisories (package-level warnings) --

export const advisories = sqliteTable('advisories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull().default('info'),
  kbDocumentId: integer('kb_document_id').references(() => kbDocuments.id, { onDelete: 'set null' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- Advisory <-> Package junction --

export const advisoryPackages = sqliteTable('advisory_packages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  advisoryId: integer('advisory_id').notNull().references(() => advisories.id, { onDelete: 'cascade' }),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('idx_advisory_pkg_unique').on(table.advisoryId, table.packageId),
]);

// -- Activity Events (audit log for automated actions) --

export const activityEvents = sqliteTable('activity_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // cve_auto_cleared, cve_dismissed, cve_reopened
  message: text('message').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default(sql`'{}'`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- Settings (key-value config store) --

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- Staleness History (daily snapshots for trend tracking) --

export const stalenessHistory = sqliteTable('staleness_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Uses text 'YYYY-MM-DD' format rather than timestamp for date-only dedup key
  snapshotDate: text('snapshot_date').notNull().unique(), // YYYY-MM-DD
  totalPackages: integer('total_packages').notNull(),
  packagesOutdated: integer('packages_outdated').notNull(),
  avgScore: real('avg_score'),
  maxScore: real('max_score'),
  openCves: integer('open_cves').notNull(),
  computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

// -- Sessions (SQLite-backed @fastify/session store) --

export const sessions = sqliteTable('sessions', {
  sid: text('sid').primaryKey(),
  sess: text('sess', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  expires: integer('expires').notNull(), // unix epoch milliseconds
}, (table) => [
  index('idx_sessions_expires').on(table.expires),
]);

// -- Unmatched CVE Products (for alias auto-suggestion) --

export const unmatchedCveProducts = sqliteTable('unmatched_cve_products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productName: text('product_name').notNull(),
  vendor: text('vendor'),
  cveCount: integer('cve_count').notNull().default(1),
  firstSeen: integer('first_seen', { mode: 'timestamp_ms' }).notNull().default(now),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }).notNull().default(now),
}, (table) => [
  uniqueIndex('idx_unmatched_product_unique').on(table.productName, table.vendor),
]);
