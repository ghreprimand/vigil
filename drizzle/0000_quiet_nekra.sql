CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `advisories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`kb_document_id` integer,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kb_document_id`) REFERENCES `kb_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `advisory_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`advisory_id` integer NOT NULL,
	`package_id` integer NOT NULL,
	FOREIGN KEY (`advisory_id`) REFERENCES `advisories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_advisory_pkg_unique` ON `advisory_packages` (`advisory_id`,`package_id`);--> statement-breakpoint
CREATE TABLE `batch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`package_id` integer NOT NULL,
	`from_version` text NOT NULL,
	`to_version` text NOT NULL,
	`build_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `update_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `book_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_name` text NOT NULL,
	`book_version` text NOT NULL,
	`book` text NOT NULL,
	`section` text,
	`url` text,
	`checked_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_versions_unique` ON `book_versions` (`package_name`,`book`);--> statement-breakpoint
CREATE TABLE `dependency_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`depends_on_id` integer NOT NULL,
	`dependency_type` text DEFAULT 'runtime' NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dep_edges_unique` ON `dependency_edges` (`package_id`,`depends_on_id`,`dependency_type`);--> statement-breakpoint
CREATE INDEX `idx_dep_edges_package` ON `dependency_edges` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_dep_edges_depends_on` ON `dependency_edges` (`depends_on_id`);--> statement-breakpoint
CREATE TABLE `kb_document_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`package_id` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `kb_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kb_doc_pkg_unique` ON `kb_document_packages` (`document_id`,`package_id`);--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]',
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kb_documents_slug_unique` ON `kb_documents` (`slug`);--> statement-breakpoint
CREATE TABLE `manifest_pushes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pushed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`source_ip` text,
	`package_count` integer NOT NULL,
	`packages_added` text DEFAULT '[]',
	`packages_removed` text DEFAULT '[]',
	`packages_updated` text DEFAULT '{}',
	`raw_manifest` text
);
--> statement-breakpoint
CREATE INDEX `idx_manifest_pushes_pushed_at` ON `manifest_pushes` (`pushed_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`sent_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`metadata` text DEFAULT '{}'
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_type` ON `notifications` (`type`);--> statement-breakpoint
CREATE TABLE `package_vulnerabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`vulnerability_id` integer NOT NULL,
	`match_confidence` text DEFAULT 'exact' NOT NULL,
	`affected_start` text,
	`affected_end_excluding` text,
	`affected_end_including` text,
	`match_source` text,
	`match_reason` text,
	`ecosystem` text,
	`needs_triage` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pkg_vuln_unique` ON `package_vulnerabilities` (`package_id`,`vulnerability_id`);--> statement-breakpoint
CREATE INDEX `idx_pkg_vuln_package` ON `package_vulnerabilities` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_pkg_vuln_needs_triage` ON `package_vulnerabilities` (`needs_triage`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text DEFAULT '',
	`architecture` text DEFAULT 'x86_64',
	`depends` text DEFAULT '[]',
	`provides` text DEFAULT '[]',
	`groups` text DEFAULT '[]',
	`build_date` integer,
	`install_date` integer,
	`first_seen` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`removed_at` integer,
	`pinned_at` integer,
	`pin_reason` text,
	`deferred_at` integer,
	`defer_reason` text,
	`defer_days` integer,
	`watched_at` integer,
	`metadata` text DEFAULT '{}'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `packages_name_unique` ON `packages` (`name`);--> statement-breakpoint
CREATE INDEX `idx_packages_removed_at` ON `packages` (`removed_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staleness_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_date` text NOT NULL,
	`total_packages` integer NOT NULL,
	`packages_outdated` integer NOT NULL,
	`avg_score` real,
	`max_score` real,
	`open_cves` integer NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staleness_history_snapshot_date_unique` ON `staleness_history` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `staleness_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`versions_behind` integer DEFAULT 0 NOT NULL,
	`days_behind` integer DEFAULT 0 NOT NULL,
	`has_cve` integer DEFAULT false NOT NULL,
	`max_cvss` real DEFAULT 0,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staleness_scores_package_id_unique` ON `staleness_scores` (`package_id`);--> statement-breakpoint
CREATE TABLE `unmatched_cve_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_name` text NOT NULL,
	`vendor` text,
	`cve_count` integer DEFAULT 1 NOT NULL,
	`first_seen` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_unmatched_product_unique` ON `unmatched_cve_products` (`product_name`,`vendor`);--> statement-breakpoint
CREATE TABLE `update_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `upstream_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`version` text NOT NULL,
	`release_date` integer,
	`release_notes` text,
	`release_url` text,
	`is_newer` integer DEFAULT false NOT NULL,
	`discovered_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `upstream_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_upstream_releases_package` ON `upstream_releases` (`package_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_upstream_releases_unique` ON `upstream_releases` (`package_id`,`source_id`,`version`);--> statement-breakpoint
CREATE TABLE `upstream_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`check_interval` integer DEFAULT 14400 NOT NULL,
	`last_checked` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_upstream_sources_package` ON `upstream_sources` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_upstream_sources_type` ON `upstream_sources` (`source_type`);--> statement-breakpoint
CREATE TABLE `vulnerabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cve_id` text NOT NULL,
	`title` text,
	`description` text,
	`severity` text,
	`cvss_score` real,
	`source` text NOT NULL,
	`source_url` text,
	`published_at` integer,
	`fixed_version` text,
	`status` text DEFAULT 'open' NOT NULL,
	`dismissed_reason` text,
	`ecosystem` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vulnerabilities_cve_id_unique` ON `vulnerabilities` (`cve_id`);--> statement-breakpoint
CREATE INDEX `idx_vulnerabilities_status` ON `vulnerabilities` (`status`);--> statement-breakpoint
CREATE INDEX `idx_vulnerabilities_severity` ON `vulnerabilities` (`severity`);