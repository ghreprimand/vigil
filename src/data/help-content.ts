export const helpContent: Record<string, { title: string; description: string; learnMore?: string }> = {

  // --- Global (header bar) --------------------------------------------

  'nav-server-uptime': {
    title: 'Server Uptime',
    description: '<p>Time since the Vigil host was last rebooted. Refreshes on each page load.</p>',
  },

  // --- Overview page ---------------------------------------------------

  'overview-total-packages': {
    title: 'Packages & Upstream Coverage',
    description:
      '<p>The total number of packages currently tracked by Vigil, plus the <strong>upstream coverage percentage</strong>  -  the proportion of packages that have a configured upstream source for version checking.</p>' +
      '<p>Package count includes all types: <strong>pacman</strong> packages, <strong>standalone</strong> builds, <strong>AppImages</strong>, and <strong>Flatpaks</strong>. Updates every time a manifest push is received.</p>' +
      '<p>Coverage color: <strong>green</strong> (&ge;90%), <strong>orange</strong> (70-90%), <strong>red</strong> (&lt;70%).</p>',
    learnMore: '/help#manifest-push',
  },

  'overview-outdated': {
    title: 'Outdated Packages',
    description:
      '<p>The number of packages where a <strong>newer upstream version</strong> has been detected and the package is not currently pinned or deferred.</p>' +
      '<p>These are packages that could be updated. The count excludes:</p>' +
      '<ul>' +
      '<li><strong>Pinned</strong> packages  -  permanently excluded from the outdated list</li>' +
      '<li><strong>Deferred</strong> packages  -  temporarily hidden for a set period</li>' +
      '<li><strong>Unchecked</strong> packages  -  no upstream source configured, so no comparison is possible</li>' +
      '</ul>' +
      '<p>Visit the <strong>Updates</strong> page to see the full list and take action.</p>',
    learnMore: '/help#updates',
  },

  'overview-open-cves-count': {
    title: 'Open CVEs Count',
    description:
      '<p>Row in the Packages summary card showing the number of <strong>confirmed open CVEs</strong> currently matched to your installed packages. The CVE page splits these into <strong>Fix available</strong> and <strong>No fix yet</strong>.</p>' +
      '<p>Click the count to open the CVE tracker. The default view shows only CVEs with known fix targets.</p>',
    learnMore: '/help#cves',
  },

  'overview-outdated-count': {
    title: 'Outdated Count',
    description:
      '<p>Row in the Packages summary card showing the number of packages with <strong>newer upstream versions available</strong>. This excludes pinned and deferred packages. Click the count to jump to the Updates page.</p>',
    learnMore: '/help#updates',
  },

  'overview-active-advisories': {
    title: 'Active Advisories',
    description:
      '<p>Row in the Packages summary card showing the number of <strong>active advisories</strong> currently attached to packages. Advisories are manually created notes flagging security risks, build issues, or informational notes.</p>',
    learnMore: '/help#advisories',
  },



  'overview-packages-section': {
    title: 'Packages Summary',
    description:
      '<p>A summary card showing key package statistics: total count, outdated count, open CVEs, and active advisories. Click the header to go to the full Packages page.</p>',
    learnMore: '/help#packages',
  },

  'overview-recent-activity': {
    title: 'Recent Activity',
    description:
      '<p>The most recent <strong>activity events</strong>  -  manifest pushes, version changes, CVE matches, and other system events. Click the header to view the full Activity page with detailed history.</p>',
    learnMore: '/help#activity',
  },

  'overview-recent-notifications': {
    title: 'Recent Notifications',
    description:
      '<p>The last 5 <strong>email alerts</strong> sent by Vigil. Each row shows a type badge, a summary of the notification content, and a relative timestamp.</p>' +
      '<p>Redundant prefixes are stripped from subjects so you see the useful detail at a glance. Click the header to go to the Settings page to configure alerts and view the full notification log.</p>',
    learnMore: '/help#notifications',
  },

  'overview-recently-added': {
    title: 'Recently Added Packages',
    description:
      '<p>The last 5 packages <strong>added to the manifest</strong>. These are packages that appeared for the first time in a recent manifest push, typically after building and installing new software on the monitored system.</p>',
  },



  'overview-open-cves': {
    title: 'Open CVEs',
    description:
      '<p>The count of confirmed <strong>open CVEs</strong> (Common Vulnerabilities and Exposures) currently matched to your installed packages.</p>' +
      '<p>CVEs are security vulnerabilities reported by organizations like NIST (NVD), the OSV database, and Arch Linux Security. Vigil automatically matches CVEs to your packages based on package name and version.</p>' +
      '<p>The CVE tracker separates these into <strong>Fix available</strong> (update/rebuild work), <strong>No fix yet</strong> (monitor or mitigate), and <strong>Needs triage</strong> (unconfirmed matches).</p>',
    learnMore: '/help#cves',
  },

  'overview-last-push': {
    title: 'Last Manifest Push',
    description:
      '<p>The timestamp of the most recent <strong>manifest push</strong> from the monitored system.</p>' +
      '<p>A manifest push syncs the full list of installed packages and their versions from the monitored system to Vigil. This is how the system knows what you have installed and which versions are running.</p>' +
      '<p>Pushes are triggered by your producer script. If this timestamp is stale (more than a day or two old), the dashboard data may not reflect your current system state.</p>',
    learnMore: '/help#manifest-push',
  },

  'overview-staleness-tiers': {
    title: 'Staleness Tiers',
    description:
      '<p>A breakdown of outdated packages grouped by <strong>urgency tier</strong>, based on their staleness score:</p>' +
      '<ul>' +
      '<li><strong>Critical (score &ge; 25)</strong>  -  Packages with serious risk factors: open CVEs, high CVSS scores, many versions behind, or many reverse dependencies. Update these first.</li>' +
      '<li><strong>High (15&ndash;24)</strong>  -  Significant risk. These packages have multiple concerning factors and should be updated soon.</li>' +
      '<li><strong>Medium (5&ndash;14)</strong>  -  Moderate risk. These are outdated but don\'t have the compounding factors of higher tiers.</li>' +
      '<li><strong>Low (0&ndash;4)</strong>  -  Minor risk. Recently released updates or packages with few dependencies.</li>' +
      '</ul>' +
      '<p>The staleness score considers CVE presence, CVSS severity, versions behind, days since release, and reverse dependency count.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'overview-batch-progress': {
    title: 'Active Batch',
    description:
      '<p>Shows the status of the <strong>current update batch</strong>  -  a planned set of packages to update together. Only appears when a batch is active (planned or in progress).</p>' +
      '<p>The progress bar indicates how many items in the batch have been completed versus the total planned. Displayed as a full-width card above the main two-column grid.</p>',
    learnMore: '/help#batches',
  },

  'overview-most-outdated': {
    title: 'Most Outdated Packages',
    description:
      '<p>The 5 packages with the <strong>highest staleness scores</strong>, sorted from most to least urgent. Shows each package\'s current installed version, how many days behind the latest release, and how many versions behind.</p>' +
      '<p>Staleness scores factor in CVE presence, CVSS severity, versions behind, days since release, and reverse dependency count. Packages that are pinned or deferred are excluded.</p>' +
      '<p>Click any package name to see its full detail page with upstream release history.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'overview-configure-layout': {
    title: 'Configure Layout',
    description:
      '<p>The <strong>Configure</strong> button (gear icon) in the nav bar opens a modal to customize which cards appear on the overview page.</p>' +
      '<p>Toggle visibility with checkboxes, set card width (<strong>&frac12;</strong> for half-width / <strong>Full</strong> for full-width), set a max height in pixels (<strong>H:</strong> field, 0 = auto), and adjust how many items cards like Recently Added or Most Outdated show (<strong>Items:</strong> field).</p>' +
      '<p>Changes are saved to the database and persist across sessions. <strong>Reset to Defaults</strong> restores the original layout.</p>',
  },

  'overview-arrange-mode': {
    title: 'Arrange Cards',
    description:
      '<p>The <strong>Arrange</strong> button (move icon) in the nav bar enters arrange mode. An orange toolbar appears at the top.</p>' +
      '<p>Each card shows a labeled drag handle &mdash; grab it to drag cards to new positions in the grid. Half-width cards flow into a 2-column grid; full-width cards span both columns.</p>' +
      '<p>Click <strong>Save Order</strong> to persist the new arrangement, or <strong>Cancel</strong> to revert. Auto-refresh pauses during arrange mode.</p>',
  },

  'overview-staleness-trend': {
    title: 'Staleness Trend',
    description:
      '<p>An ECharts line chart showing three metrics over time: number of <strong>outdated packages</strong> (orange), <strong>average staleness score</strong> (blue), and <strong>open CVE count</strong> (red).</p>' +
      '<p>Defaults to the last 30 days. The time window is configurable via the <strong>Items</strong> field in Configure (controls how many daily snapshots to show).</p>' +
      '<p>Data comes from the <code>staleness_history</code> table populated daily by the <strong>staleness-scorer</strong> worker.</p>',
  },

  'overview-watched-packages': {
    title: 'Watched Packages',
    description:
      '<p>Shows packages you\'ve starred/watched, sorted by staleness score (highest first).</p>' +
      '<p>Each row shows the package name, installed version, and current staleness score (colored by tier: <strong style="color:#e53e3e;">red &ge; 25</strong>, <strong style="color:#dd6b20;">orange &ge; 15</strong>, <strong style="color:#d69e2e;">yellow &ge; 5</strong>, <strong style="color:#38a169;">green</strong> = up to date).</p>' +
      '<p>Star a package from its detail page to add it here. The item count is configurable via Configure.</p>',
  },

  'overview-worker-status': {
    title: 'Worker Status',
    description:
      '<p>A compact grid showing all <strong>16 background workers</strong>. Each cell has a status dot (<strong>green</strong> = recently completed, <strong>red</strong> = consecutive failures, <strong>gray</strong> = not yet run or disabled), the worker name, and how long ago it last completed successfully.</p>' +
      '<p>Useful for quickly spotting stuck or failing workers without visiting Settings. Hidden by default &mdash; enable via Configure.</p>',
  },

  'overview-cve-severity': {
    title: 'CVE Severity Breakdown',
    description:
      '<p>Shows confirmed open CVEs broken down by severity tier: <strong>Critical</strong> (CVSS &ge; 9.0), <strong>High</strong> (&ge; 7.0), <strong>Medium</strong> (&ge; 4.0), <strong>Low</strong> (&lt; 4.0).</p>' +
      '<p>Displays colored count boxes and a proportional bar. Needs-triage links are excluded from confirmed exposure counts.</p>' +
      '<p>Hidden by default &mdash; enable via Configure.</p>',
  },

  'overview-upstream-coverage': {
    title: 'Upstream Coverage',
    description:
      '<p>A donut chart and stats showing how many packages have <strong>upstream monitoring configured</strong> vs unmonitored. Shows monitored count, unmonitored count, total, and coverage percentage.</p>' +
      '<p>Below the stats, tag badges show the breakdown by source type (<strong>github</strong>, <strong>gitlab</strong>, <strong>kernel</strong>, <strong>kde</strong>, <strong>gnu</strong>, <strong>pypi</strong>, etc.).</p>' +
      '<p>Hidden by default &mdash; enable via Configure.</p>',
  },

  // --- Packages page --------------------------------------------------

  'packages-total': {
    title: 'Total Packages',
    description: '<p>Total number of packages tracked from your pacman database, standalone binaries, AppImages, and Flatpaks. Updates on each manifest push.</p>',
  },

  'packages-outdated-stat': {
    title: 'Outdated Packages',
    description: '<p>Packages where a newer upstream version has been detected. Click to filter the table to outdated packages only.</p>' +
      '<p>The tier badges (<strong>Critical</strong>, <strong>High</strong>, <strong>Medium</strong>, <strong>Low</strong>) break down by staleness score. Click a badge to filter to that tier.</p>',
    learnMore: '/help#staleness',
  },

  'packages-deferred-stat': {
    title: 'Deferred Packages',
    description: '<p>Packages temporarily hidden from the outdated count. They still receive upstream and CVE monitoring  -  if a CVE is found during deferral, the package resurfaces automatically. Click to filter to deferred packages.</p>',
    learnMore: '/help#deferring',
  },

  'packages-open-cves-stat': {
    title: 'Open CVEs',
    description: '<p>Confirmed security vulnerabilities (CVEs) affecting your installed packages. Some may already be at the latest upstream version; those appear under <strong>No fix yet</strong> instead of Updates. Click to go to the CVEs page.</p>',
    learnMore: '/help#cves',
  },

  'packages-last-push-stat': {
    title: 'Last Manifest Push',
    description: '<p>When the monitored system last pushed its package list to this server. How often this happens depends on how you run your producer (for example a package-manager hook or a daily timer).</p>' +
      '<p>The badges show what changed: <strong>+N new</strong> (newly installed packages) and <strong>N updated</strong> (version changes).</p>',
    learnMore: '/help#manifest-push',
  },

  'packages-sort-filter': {
    title: 'Sort By',
    description: '<p>Sort the package table by: <strong>Name</strong> (alphabetical), <strong>Version</strong>, <strong>Last Seen</strong> (most recently seen in manifest), or <strong>Install Date</strong>.</p>',
  },

  'packages-search': {
    title: 'Package Search',
    description:
      '<p>Filter the package list by name. The search is <strong>case-insensitive</strong> and filters as you type  -  no need to press Enter.</p>' +
      '<p>This searches package names only (not descriptions or group names). For example, typing <code>mesa</code> will match <code>mesa</code>, <code>mesa-demos</code>, and <code>libva-mesa-driver</code>.</p>',
  },

  'packages-status-filter': {
    title: 'Status Filter',
    description:
      '<p>Filter packages by their current status:</p>' +
      '<ul>' +
      '<li><strong>All</strong>  -  Show every package</li>' +
      '<li><strong>Outdated</strong>  -  A newer upstream version exists</li>' +
      '<li><strong>Critical / High / Medium / Low</strong>  -  Filter by staleness tier (based on composite score)</li>' +
      '<li><strong>CVEs</strong>  -  Has one or more open security vulnerabilities</li>' +
      '<li><strong>Deferred</strong>  -  Temporarily excluded from the outdated list</li>' +
      '<li><strong>Up to date</strong>  -  Installed version matches or exceeds the latest upstream</li>' +
      '<li><strong>Unchecked</strong>  -  No upstream source configured, so version can\'t be compared</li>' +
      '<li><strong>Removed</strong>  -  Previously tracked but no longer present in the latest manifest push</li>' +
      '</ul>',
    learnMore: '/help#package-statuses',
  },

  'packages-group-filter': {
    title: 'Group Filter',
    description:
      '<p>Filter packages by their <strong>group membership</strong>. Groups correspond to how packages are categorized on the monitored system:</p>' +
      '<ul>' +
      '<li><strong>lfs</strong>  -  Linux From Scratch core packages</li>' +
      '<li><strong>kde-frameworks</strong>  -  KDE Frameworks libraries</li>' +
      '<li><strong>kde-plasma</strong>  -  KDE Plasma desktop environment</li>' +
      '<li><strong>toolchain</strong>  -  Compiler toolchain (GCC, binutils, glibc, etc.)</li>' +
      '<li><strong>standalone</strong>  -  Packages installed outside the pacman system</li>' +
      '</ul>' +
      '<p>Groups are assigned during the manifest push from the monitored system, and some are set server-side (like "toolchain").</p>',
    learnMore: '/help#groups',
  },

  'packages-col-name': {
    title: 'Package Name',
    description:
      '<p>The package name as registered in <strong>pacman</strong> or the manifest system. Click the name to open the package detail page.</p>' +
      '<p>This is the canonical identifier used for upstream version matching, CVE matching, and dependency tracking.</p>',
  },

  'packages-col-version': {
    title: 'Installed Version',
    description:
      '<p>The version <strong>currently installed</strong> on the monitored system, as reported by the most recent manifest push.</p>' +
      '<p>This may differ from the latest upstream version if the package is outdated. The version string comes directly from pacman or the manifest and may include release suffixes.</p>',
  },

  'packages-col-latest': {
    title: 'Latest Upstream Version',
    description:
      '<p>The <strong>latest version</strong> detected by the upstream release-checking workers. This is the version you would update to.</p>' +
      '<p>If this column is empty or shows a dash, it means no upstream source is configured for this package (unchecked), or the worker hasn\'t run yet.</p>' +
      '<p>Version detection depends on the source type  -  GitHub releases, Git tags, GNU FTP listings, PyPI API, etc. Some packages use version filtering rules to skip pre-releases or non-standard tags.</p>',
  },

  'packages-status-badge': {
    title: 'Status Badge',
    description:
      '<p>A colored badge showing the package\'s current status:</p>' +
      '<ul>' +
      '<li><strong style="color:#2a9d2a;">Green "current"</strong>  -  The installed version matches or exceeds the latest upstream version. No action needed.</li>' +
      '<li><strong style="color:#e67e22;">Orange "outdated"</strong>  -  A newer upstream version is available. Consider updating.</li>' +
      '<li><strong style="color:#9b59b6;">Purple "pinned"</strong>  -  Permanently excluded from the outdated list. The package is intentionally kept at this version.</li>' +
      '<li><strong style="color:#95a5a6;">Gray "deferred"</strong>  -  Temporarily excluded from the outdated list for a set period. Will reappear after the deferral expires or if a CVE is found.</li>' +
      '</ul>',
    learnMore: '/help#package-statuses',
  },

  'packages-cve-badge': {
    title: 'CVE Badge',
    description:
      '<p>A <strong>red badge</strong> showing the number of open CVEs (security vulnerabilities) affecting this package at its current installed version.</p>' +
      '<p>Packages with CVE badges should be reviewed  -  click the package to see CVE details, severity scores, and whether a fix version is available. Packages with both a CVE badge and "outdated" status are the highest priority for updates.</p>',
    learnMore: '/help#cves',
  },

  'packages-advisory-badge': {
    title: 'Advisory Badge',
    description:
      '<p>Indicates that one or more <strong>custom advisories</strong> have been attached to this package by the administrator.</p>' +
      '<p>Advisories are manually created notes that can flag security risks, build issues, workarounds, or informational notes. Click the package to see the advisory details.</p>',
    learnMore: '/help#advisories',
  },

  'packages-badge-advisory': {
    title: 'Advisory Badge',
    description:
      '<p>A badge indicating this package has one or more <strong>active advisories</strong>. The number shows how many advisories are currently attached.</p>' +
      '<p>Click the package name to view the advisory details, severity, and recommended actions.</p>',
    learnMore: '/help#advisories',
  },

  'packages-badge-deferred': {
    title: 'Deferred Badge',
    description:
      '<p>Indicates this package is <strong>temporarily deferred</strong>  -  hidden from the outdated list for a set number of days. The package will reappear automatically when the deferral period expires or immediately if a CVE is found.</p>',
    learnMore: '/help#pin-defer',
  },

  'packages-badge-pinned': {
    title: 'Pinned Badge',
    description:
      '<p>Indicates this package is <strong>permanently pinned</strong> at its current version. Pinned packages are excluded from the outdated list but still receive CVE monitoring.</p>',
    learnMore: '/help#pin-defer',
  },

  'packages-badge-removed': {
    title: 'Removed Badge',
    description:
      '<p>Indicates this package is <strong>no longer installed</strong> on the monitored system. It was present in a previous manifest push but absent from the most recent one. The package record is kept for historical reference.</p>',
  },

  'packages-col-status': {
    title: 'Status Column',
    description:
      '<p>The package\'s current status relative to upstream:</p>' +
      '<ul>' +
      '<li><strong>current</strong>  -  Up to date with the latest known upstream version</li>' +
      '<li><strong>outdated</strong>  -  A newer upstream version is available</li>' +
      '<li><strong>no upstream</strong>  -  No upstream source is configured for version monitoring</li>' +
      '<li><strong>pinned</strong>  -  Permanently held at current version</li>' +
      '<li><strong>deferred</strong>  -  Temporarily hidden from the outdated list</li>' +
      '<li><strong>removed</strong>  -  No longer installed on the monitored system</li>' +
      '</ul>',
    learnMore: '/help#package-statuses',
  },

  'packages-col-groups': {
    title: 'Groups',
    description:
      '<p>The <strong>package groups</strong> this package belongs to. Groups categorize packages by their role or origin on the monitored system.</p>' +
      '<p>Common groups include <code>lfs</code> (core system), <code>kde-frameworks</code>, <code>kde-plasma</code>, <code>toolchain</code>, and <code>standalone</code>. A package can belong to multiple groups.</p>' +
      '<p>Groups are used for filtering and for auto-generating update batches by category.</p>',
  },

  'packages-col-last-seen': {
    title: 'Last Seen',
    description:
      '<p>When this package was <strong>last present in a manifest push</strong> from the monitored system.</p>' +
      '<p>If this date is older than the most recent push, the package was removed from the monitored system (it\'s no longer installed). These packages show with a "removed" status.</p>',
  },

  // --- Pinned page --------------------------------------------------

  'pinned-col-package': {
    title: 'Package',
    description:
      '<p>The <strong>name</strong> of the pinned package. Click to open its detail page.</p>',
  },

  'pinned-col-version': {
    title: 'Version',
    description:
      '<p>The <strong>installed version</strong> at the time the package was pinned. The package will remain at this version until unpinned.</p>',
  },

  'pinned-col-reason': {
    title: 'Reason',
    description:
      '<p>The <strong>reason</strong> provided when the package was pinned  -  explaining why it is intentionally held at the current version (e.g., newer version has a regression, incompatible with system configuration).</p>',
  },

  'pinned-col-pinned-at': {
    title: 'Pinned At',
    description:
      '<p>The <strong>date and time</strong> when the package was pinned. Review old pins periodically to check whether the original reason still applies.</p>',
  },

  'pinned-col-actions': {
    title: 'Actions',
    description:
      '<p>Available actions for pinned packages. Currently supports <strong>Unpin</strong> to remove the pin and return the package to normal update tracking.</p>',
  },

  'pinned-unpin': {
    title: 'Unpin',
    description:
      '<p><strong>Remove the pin</strong> from this package, returning it to normal update tracking. If a newer upstream version exists, the package will appear on the Updates page as outdated.</p>',
  },

  // --- Batch items partial ----------------------------------------------

  'batch-build-order': {
    title: 'Build Order',
    description: '<p>Packages in a batch are ordered by <strong>dependency topology</strong>  -  dependencies are built before the packages that need them. This ensures a safe update sequence without broken builds.</p>',
  },
  'batch-item-order': {
    title: 'Build Order Number',
    description: '<p>The position of this package in the build sequence. Lower numbers are built first. Packages are sorted so dependencies come before dependents.</p>',
  },
  'batch-item-checkbox': {
    title: 'Completion Toggle',
    description: '<p>Click the checkbox to mark this package as completed or pending. Tracks your progress through the batch.</p>',
  },
  'batch-item-package': {
    title: 'Package',
    description: '<p>The package name. Click to view the package detail page with upstream source info, dependencies, and CVEs.</p>',
  },
  'batch-item-from': {
    title: 'From Version',
    description: '<p>The currently installed version of this package on the monitored system.</p>',
  },
  'batch-item-to': {
    title: 'To Version',
    description: '<p>The target version  -  the latest upstream release detected. This is the version you\'ll update to.</p>',
  },
  'batch-item-score': {
    title: 'Staleness Score',
    description: '<p>The urgency score for this package at the time the batch was created. Higher scores indicate more urgent updates.</p>',
  },
  'batch-item-cves': {
    title: 'CVE Count',
    description: '<p>Number of confirmed open CVEs affecting this package at its current version. Prioritize packages where a fixed version is known; no-fix-yet CVEs usually require monitoring or mitigation rather than another rebuild.</p>',
  },

  // --- CVE status actions partial ---------------------------------------

  'cve-actions-header': {
    title: 'CVE Actions',
    description: '<p>Actions you can take on this CVE. <strong>Dismiss</strong> marks it as reviewed and not a concern. You must provide a reason and can optionally add a comment.</p>',
    learnMore: '/help#cves',
  },
  'cve-dismiss-reason-select': {
    title: 'Dismiss Reason',
    description: '<p>Select why this CVE is being dismissed:</p><ul><li><strong>Not applicable</strong>  -  the vulnerability doesn\'t affect your configuration</li><li><strong>False positive</strong>  -  incorrectly matched to your package</li><li><strong>Mitigated by configuration</strong>  -  you have compensating controls in place</li><li><strong>Low risk - accepted</strong>  -  the risk is acknowledged and accepted</li></ul>',
  },
  'cve-dismiss-btn': {
    title: 'Dismiss CVE',
    description: '<p>Mark this CVE as dismissed with the selected reason. Dismissed CVEs are hidden from the default view but can be reopened later if needed.</p>',
  },
  'cve-dismiss-comment': {
    title: 'Dismiss Comment',
    description: '<p>Optional notes about why this CVE is being dismissed. Useful for future reference when reviewing dismissed CVEs.</p>',
  },
  'cve-dismissed-header': {
    title: 'Dismissed CVE',
    description: '<p>This CVE has been reviewed and dismissed. The dismiss reason and any comments are shown. You can <strong>reopen</strong> it if the situation changes.</p>',
  },
  'cve-reopen-btn': {
    title: 'Reopen CVE',
    description: '<p>Return this dismissed CVE to <strong>open</strong> status. Use this if the dismissal reason is no longer valid or if new information makes this CVE relevant again.</p>',
    learnMore: '/help#pin-defer',
  },

  // --- Package Detail -------------------------------------------------

  'pkg-staleness-score': {
    title: 'Staleness Score',
    description:
      '<p>A <strong>composite urgency score</strong> that ranks how urgently a package should be updated. Higher scores mean higher priority.</p>' +
      '<p>The formula combines multiple risk factors:</p>' +
      '<ul>' +
      '<li><strong>+10</strong> if the package has any open CVE</li>' +
      '<li><strong>+CVSS &times; 2</strong> for the highest CVSS score among open CVEs</li>' +
      '<li><strong>+min(versions_behind &times; 3, 15)</strong> for how many versions behind (capped at 15)</li>' +
      '<li><strong>+min(days_behind / 30, 10)</strong> for how long the update has been available (capped at 10)</li>' +
      '<li><strong>+min(reverse_deps / 10, 5)</strong> for the number of packages that depend on this one (capped at 5)</li>' +
      '</ul>' +
      '<p>Tiers: <strong>Critical</strong> (&ge;25), <strong>High</strong> (15&ndash;24), <strong>Medium</strong> (5&ndash;14), <strong>Low</strong> (0&ndash;4).</p>',
    learnMore: '/help#staleness-scoring',
  },

  'pkg-pin': {
    title: 'Pin Package',
    description:
      '<p><strong>Pinning</strong> permanently excludes a package from the outdated list. Use this for packages you intentionally keep at a specific version  -  for example, if a newer release has a known regression or is incompatible with your system.</p>' +
      '<p>Pinned packages:</p>' +
      '<ul>' +
      '<li>Do <strong>not</strong> appear on the Updates page</li>' +
      '<li><strong>Still</strong> receive CVE monitoring  -  you\'ll be alerted to new vulnerabilities</li>' +
      '<li>Show a <strong>purple "pinned" badge</strong> on the Packages page</li>' +
      '<li>Can be <strong>unpinned</strong> at any time to return to normal tracking</li>' +
      '</ul>',
    learnMore: '/help#pin-defer',
  },

  'pkg-defer': {
    title: 'Defer Package',
    description:
      '<p><strong>Deferring</strong> temporarily hides a package from the outdated list for a set number of days: <strong>7</strong>, <strong>30</strong>, or <strong>90</strong>.</p>' +
      '<p>This is useful when you know about an update but want to wait  -  for example, to let a new version stabilize before building it, or to batch it with related updates later.</p>' +
      '<p>Key behaviors:</p>' +
      '<ul>' +
      '<li>The package reappears automatically after the deferral period expires</li>' +
      '<li>If a <strong>CVE is found</strong> during deferral, the package <strong>resurfaces immediately</strong>  -  security always takes priority</li>' +
      '<li>You can cancel a deferral early from the package detail page</li>' +
      '</ul>',
    learnMore: '/help#pin-defer',
  },

  'pkg-watch': {
    title: 'Watch Package',
    description:
      '<p><strong>Watching</strong> a package sends you an <strong>email alert</strong> when a new upstream version is detected by the release-checking workers.</p>' +
      '<p>This is useful for packages you want to update promptly  -  security-critical libraries, toolchain components, or packages you maintain patches for.</p>' +
      '<p>Watch alerts are separate from CVE alerts and the weekly digest. You can watch any number of packages.</p>',
    learnMore: '/help#notifications',
  },

  'pkg-upstream-source': {
    title: 'Upstream Source',
    description:
      '<p>The configured <strong>upstream source</strong> for version checking. This tells Vigil where to look for new releases of this package.</p>' +
      '<p>Supported source types:</p>' +
      '<ul>' +
      '<li><strong>GitHub</strong>  -  Checks GitHub Releases or tags for a repository</li>' +
      '<li><strong>GitLab</strong>  -  Checks GitLab releases or tags</li>' +
      '<li><strong>GNU</strong>  -  Checks GNU FTP mirrors for tarball releases</li>' +
      '<li><strong>PyPI</strong>  -  Checks the Python Package Index API</li>' +
      '<li><strong>Kernel</strong>  -  Checks kernel.org for Linux kernel releases</li>' +
      '<li><strong>KDE</strong>  -  Checks KDE release infrastructure</li>' +
      '<li><strong>Generic</strong>  -  Custom URL pattern with regex version extraction</li>' +
      '</ul>' +
      '<p>Workers check the configured source on a schedule (typically every 2 hours) to detect new releases.</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-available-versions': {
    title: 'Available Versions',
    description:
      '<p>All upstream versions detected that are <strong>newer than the installed version</strong>. The most recent version is shown on the Updates page as the target for upgrading.</p>' +
      '<p>If multiple versions are listed, you can see the full release history and decide whether to jump to the latest or step through intermediate versions (useful for major version bumps that may require migration steps).</p>',
  },

  'pkg-dependencies': {
    title: 'Dependencies',
    description:
      '<p><strong>Runtime dependencies</strong>  -  packages that this package needs in order to run. These are extracted from the manifest push and represent the dependency tree on the monitored system.</p>' +
      '<p>When planning updates, check that dependencies are up to date first. Updating a dependency may require rebuilding packages that link against it.</p>',
    learnMore: '/help#dependencies',
  },

  'pkg-reverse-deps': {
    title: 'Reverse Dependencies',
    description:
      '<p>Packages that <strong>depend on this package</strong>. A high reverse dependency count means that updating this package has a <strong>wider impact</strong>  -  dependent packages may need to be rebuilt or tested after the update.</p>' +
      '<p>This count is a factor in the staleness score: packages with more reverse dependencies score higher because their outdatedness affects more of the system.</p>' +
      '<p>Use the <strong>Graph</strong> page to visualize the full dependency tree.</p>',
    learnMore: '/help#dependencies',
  },

  'pkg-cves': {
    title: 'Package CVEs',
    description:
      '<p><strong>Open CVEs</strong> (security vulnerabilities) affecting this package at its currently installed version. Each entry shows:</p>' +
      '<ul>' +
      '<li><strong>CVE ID</strong>  -  The unique identifier (e.g., CVE-2024-12345). Click to see full details.</li>' +
      '<li><strong>Severity</strong>  -  Critical, High, Medium, or Low based on the CVSS score</li>' +
      '<li><strong>CVSS Score</strong>  -  Numerical severity rating from 0 to 10</li>' +
      '<li><strong>Source</strong>  -  Where the CVE was detected: NVD, OSV, or Arch Security</li>' +
      '</ul>' +
      '<p>CVEs can be <strong>dismissed</strong> if you\'ve reviewed them and determined they don\'t apply, or <strong>fixed</strong> by updating past the fix version.</p>',
    learnMore: '/help#cves',
  },

  'pkg-advisories': {
    title: 'Package Advisories',
    description:
      '<p><strong>Custom advisories</strong> attached to this package by the administrator. Advisories are manually created notes that can take three severity levels:</p>' +
      '<ul>' +
      '<li><strong>Critical</strong>  -  Security risk or breaking issue requiring immediate attention</li>' +
      '<li><strong>Warning</strong>  -  Caution needed (e.g., known build issue, requires workaround)</li>' +
      '<li><strong>Info</strong>  -  Informational note (e.g., upstream project renamed, build tips)</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  'pkg-metadata': {
    title: 'Package Metadata',
    description:
      '<p>Metadata from <strong>pacman</strong> about this package, as reported in the manifest push:</p>' +
      '<ul>' +
      '<li><strong>Architecture</strong>  -  Build target (e.g., x86_64)</li>' +
      '<li><strong>Build date</strong>  -  When the package was compiled on the monitored system</li>' +
      '<li><strong>Install date</strong>  -  When the package was installed</li>' +
      '<li><strong>Description</strong>  -  The package\'s description from its pacman metadata</li>' +
      '</ul>',
  },

  'pkg-architecture': {
    title: 'Architecture',
    description:
      '<p>The <strong>build target architecture</strong> for this package (e.g., <code>x86_64</code>). This comes from the pacman metadata and indicates what platform the package was compiled for.</p>',
  },

  'pkg-build-date': {
    title: 'Build Date',
    description:
      '<p>When this package was <strong>compiled</strong> on the monitored system. A very old build date on an up-to-date package may indicate it hasn\'t been rebuilt in a while.</p>',
  },

  'pkg-install-date': {
    title: 'Install Date',
    description:
      '<p>When this package was <strong>installed</strong> on the monitored system via pacman. This may differ from the build date if the package was built and installed at different times.</p>',
  },

  'pkg-first-seen': {
    title: 'First Seen',
    description:
      '<p>When this package <strong>first appeared</strong> in a manifest push. This is the date Vigil started tracking this package.</p>',
  },

  'pkg-last-seen': {
    title: 'Last Seen',
    description:
      '<p>When this package was <strong>last present</strong> in a manifest push. If this date is older than the most recent push, the package has been removed from the monitored system.</p>',
  },

  'pkg-groups': {
    title: 'Groups',
    description:
      '<p>The <strong>package groups</strong> this package belongs to (e.g., <code>lfs</code>, <code>kde-frameworks</code>, <code>toolchain</code>). Groups categorize packages by role and are used for filtering and batch generation.</p>',
  },

  'pkg-remove': {
    title: 'Remove Package',
    description:
      '<p><strong>Delete this package</strong> from Vigil, including its upstream source configuration and all associated data. The package will reappear automatically on the next manifest push if it is still installed on the monitored system.</p>' +
      '<p>Use this to clean up packages that were added by mistake or are no longer relevant.</p>',
  },

  'pkg-cve-dismiss-toggle': {
    title: 'Dismiss CVE',
    description:
      '<p>Click to open the <strong>dismiss form</strong> for this CVE. Dismissing marks the CVE as reviewed and hides it from the open list.</p>',
    learnMore: '/help#cve-management',
  },

  'pkg-cve-dismiss-modal': {
    title: 'Dismiss CVE Form',
    description:
      '<p>A form to <strong>dismiss this CVE</strong> with a reason and optional comment. Select why the CVE is being dismissed and provide context for future reference.</p>',
    learnMore: '/help#cve-management',
  },

  'pkg-cve-dismiss-reason': {
    title: 'Dismiss Reason',
    description:
      '<p>Select the <strong>reason</strong> for dismissing this CVE:</p>' +
      '<ul>' +
      '<li><strong>Not applicable</strong>  -  The vulnerability doesn\'t affect your specific configuration</li>' +
      '<li><strong>False positive</strong>  -  The CVE was incorrectly matched to this package</li>' +
      '<li><strong>Mitigated by config</strong>  -  Your system configuration prevents exploitation</li>' +
      '<li><strong>Low risk - accepted</strong>  -  Risk is acknowledged but deemed acceptable</li>' +
      '</ul>',
    learnMore: '/help#cve-management',
  },

  'pkg-cve-dismiss-comment': {
    title: 'Dismiss Comment',
    description:
      '<p>An optional <strong>free-text comment</strong> explaining the dismissal in more detail. Useful for documenting your rationale so it can be reviewed later if the CVE is reopened.</p>',
  },

  'pkg-cve-dismiss-cancel': {
    title: 'Cancel Dismiss',
    description:
      '<p>Close the dismiss form <strong>without dismissing</strong> the CVE. The CVE remains open.</p>',
  },

  'pkg-cve-dismiss-confirm': {
    title: 'Confirm Dismiss',
    description:
      '<p><strong>Submit the dismissal</strong> with the selected reason and optional comment. The CVE will be removed from the open list. It can be reopened later if needed.</p>',
    learnMore: '/help#cve-management',
  },

  'pkg-defer-modal': {
    title: 'Defer Package Dialog',
    description:
      '<p>A dialog to <strong>defer this package</strong>  -  temporarily hiding it from the outdated list for a chosen number of days. Configure the duration and optionally provide a reason.</p>',
    learnMore: '/help#pin-defer',
  },

  'pkg-defer-modal-duration-label': {
    title: 'Duration Label',
    description:
      '<p>Label for the <strong>deferral duration</strong> selector. Choose how long to hide this package from the outdated list.</p>',
  },

  'pkg-defer-modal-duration': {
    title: 'Deferral Duration',
    description:
      '<p>Select how long to <strong>defer</strong> this package:</p>' +
      '<ul>' +
      '<li><strong>1 week (7 days)</strong>  -  Short deferral for minor delays</li>' +
      '<li><strong>1 month (30 days)</strong>  -  Standard deferral period</li>' +
      '<li><strong>3 months (90 days)</strong>  -  Long deferral for stable releases you want to skip</li>' +
      '<li><strong>Custom</strong>  -  Enter a specific number of days</li>' +
      '</ul>',
    learnMore: '/help#pin-defer',
  },

  'pkg-defer-modal-custom-days': {
    title: 'Custom Days',
    description:
      '<p>Enter a <strong>custom number of days</strong> for the deferral period (1 to 3650). Appears when "Custom" is selected from the duration dropdown.</p>',
  },

  'pkg-defer-modal-reason': {
    title: 'Deferral Reason',
    description:
      '<p>An optional <strong>reason</strong> explaining why this package is being deferred. Helpful for remembering why you chose to delay the update when the deferral expires.</p>',
  },

  'pkg-defer-modal-cancel': {
    title: 'Cancel Defer',
    description:
      '<p>Close the defer dialog <strong>without deferring</strong> the package. No changes are made.</p>',
  },

  'pkg-defer-modal-confirm': {
    title: 'Confirm Defer',
    description:
      '<p><strong>Submit the deferral</strong> with the selected duration and optional reason. The package will be hidden from the outdated list until the deferral expires or a CVE is found.</p>',
    learnMore: '/help#pin-defer',
  },

  'pkg-release-version': {
    title: 'Release Version',
    description:
      '<p>The <strong>version number</strong> of an upstream release. Versions are listed from newest to oldest, with the currently installed version marked.</p>',
  },

  'pkg-release-date': {
    title: 'Release Date',
    description:
      '<p>When this upstream version was <strong>published</strong>. Helps you assess how long a release has been available and whether it has had time to stabilize.</p>',
  },

  'pkg-release-status': {
    title: 'Release Status',
    description:
      '<p>Whether this release version is <strong>newer</strong> than your installed version, the <strong>current</strong> (installed) version, or an <strong>older</strong> version.</p>',
  },

  'pkg-release-notes': {
    title: 'Release Notes',
    description:
      '<p>Toggle visibility of the <strong>release notes</strong> or changelog for this version. Release notes are pulled from the upstream source (e.g., GitHub release body) and can help you assess the impact of an update.</p>',
  },

  'pkg-history-date': {
    title: 'History Date',
    description:
      '<p>The <strong>date and time</strong> when this package event was recorded (from a manifest push).</p>',
  },

  'pkg-history-event': {
    title: 'History Event',
    description:
      '<p>The <strong>type of change</strong> detected for this package: added (first appeared), updated (version changed), or removed (no longer in manifest).</p>',
  },

  'pkg-history-version-change': {
    title: 'Version Change',
    description:
      '<p>For update events, shows the <strong>old version &rarr; new version</strong> transition. For added events, shows the initial version. Helps track the package\'s version history over time.</p>',
  },

  'pkg-history-added': {
    title: 'Added Event',
    description:
      '<p>This package was <strong>first detected</strong> in a manifest push  -  it was newly installed on the monitored system.</p>',
  },

  'pkg-history-updated': {
    title: 'Updated Event',
    description:
      '<p>This package\'s <strong>version changed</strong> between consecutive manifest pushes, indicating it was updated on the monitored system.</p>',
  },

  'pkg-history-removed': {
    title: 'Removed Event',
    description:
      '<p>This package was <strong>absent</strong> from a manifest push after being present in the previous one, indicating it was uninstalled from the monitored system.</p>',
  },

  'pkg-source-edit': {
    title: 'Edit Source',
    description:
      '<p>Open the <strong>source configuration form</strong> to modify the upstream source settings (source type, repository URL, version filter, etc.).</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-source-remove': {
    title: 'Remove Source',
    description:
      '<p><strong>Delete the upstream source</strong> configuration for this package. The worker will stop checking for new versions, and the package will become "unchecked"  -  it won\'t appear on the Updates page.</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-source-check-now': {
    title: 'Check Now',
    description:
      '<p><strong>Immediately check</strong> the upstream source for new releases instead of waiting for the next scheduled worker run. Results appear within a few seconds.</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-source-test': {
    title: 'Test Source',
    description:
      '<p><strong>Test the source configuration</strong> without saving it. Sends a request to the upstream and displays the detected versions, helping you verify the configuration is correct before saving.</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-source-save': {
    title: 'Save Source',
    description:
      '<p><strong>Save the upstream source</strong> configuration. The next worker run will use this configuration to check for new releases.</p>',
    learnMore: '/help#upstream-sources',
  },

  'pkg-source-cancel': {
    title: 'Cancel Edit',
    description:
      '<p>Close the source configuration form <strong>without saving</strong> changes.</p>',
  },

  // --- Updates page ---------------------------------------------------

  'updates-total-outdated': {
    title: 'Total Outdated',
    description:
      '<p>The total number of packages with <strong>newer upstream versions available</strong>, excluding pinned and actively deferred packages.</p>' +
      '<p>This is the actionable count  -  every package in this list is a candidate for updating. The number can change when upstream workers detect new releases or when you pin/defer packages.</p>',
    learnMore: '/help#updates',
  },

  'updates-with-cves': {
    title: 'With CVEs',
    description:
      '<p>Packages that are <strong>both outdated AND have open CVEs</strong>. These are the <strong>highest priority</strong> for updates because you are running a version with known security vulnerabilities, and a newer version is available.</p>' +
      '<p>Prioritize these packages above all others. Updating to the latest version often resolves the CVE automatically.</p>',
    learnMore: '/help#cves',
  },

  'updates-high-priority': {
    title: 'High Priority',
    description:
      '<p>Packages with a <strong>staleness score of 20 or higher</strong>. These packages combine multiple risk factors  -  CVEs, high CVSS scores, many versions behind, lengthy outdated periods, or high reverse dependency counts.</p>' +
      '<p>Address these packages first for the most effective reduction in system risk.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'updates-avg-score': {
    title: 'Average Staleness Score',
    description:
      '<p>The <strong>average staleness score</strong> across all outdated packages. This single number gives you a sense of overall system health.</p>' +
      '<p>A low average (under 5) means most outdated packages are minor updates. A high average (over 15) suggests a backlog of significant updates with compounding risk factors. Track this over time using the trend chart on the Overview page.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'updates-pinned-count': {
    title: 'Pinned Count',
    description:
      '<p>The number of packages <strong>permanently excluded</strong> from the outdated list via pinning.</p>' +
      '<p>Pinned packages don\'t count toward the outdated total and won\'t appear in this list. They still receive CVE monitoring. Review your pinned packages periodically to see if any should be unpinned.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-deferred-count': {
    title: 'Deferred Count',
    description:
      '<p>The number of packages <strong>temporarily hidden</strong> from the outdated list via deferral.</p>' +
      '<p>Deferred packages reappear automatically after their deferral period expires (7, 30, or 90 days) or immediately if a CVE is found. This count fluctuates as deferrals expire.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-category-filter': {
    title: 'Category Filter',
    description:
      '<p>Filter the outdated package list by <strong>category</strong>:</p>' +
      '<ul>' +
      '<li><strong>All</strong>  -  Every outdated package</li>' +
      '<li><strong>Security</strong>  -  Packages with open CVEs (update these first)</li>' +
      '<li><strong>KDE</strong>  -  KDE Frameworks, Plasma, and Gear packages (often updated together)</li>' +
      '<li><strong>Core</strong>  -  LFS/BLFS phase 1&ndash;2 packages (critical system components)</li>' +
      '<li><strong>Apps</strong>  -  BLFS phase 7 and KDE Gear applications</li>' +
      '<li><strong>Toolchain</strong>  -  Compiler toolchain (GCC, binutils, glibc  -  update with care)</li>' +
      '<li><strong>Pinned</strong>  -  Permanently excluded packages (for review)</li>' +
      '<li><strong>Deferred</strong>  -  Temporarily hidden packages (for review)</li>' +
      '</ul>',
    learnMore: '/help#updates',
  },

  'updates-min-score': {
    title: 'Minimum Score Filter',
    description:
      '<p>Only show packages with a staleness score <strong>at or above</strong> this threshold. Use this to focus on the most urgent updates.</p>' +
      '<p>Common thresholds: <strong>5</strong> hides trivial updates, <strong>15</strong> shows only high/critical, <strong>25</strong> shows only critical-tier packages.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'updates-col-score': {
    title: 'Staleness Score',
    description:
      '<p>A <strong>composite urgency score</strong> that ranks how urgently this package should be updated. Higher scores mean higher priority.</p>' +
      '<p>The score factors in: CVE presence (+10), CVSS severity (&times;2), versions behind (&times;3, max 15), days outdated (/30, max 10), and reverse dependency count (/10, max 5).</p>' +
      '<p>The badge color indicates the tier: <strong>green</strong> (low), <strong>yellow</strong> (medium), <strong>orange</strong> (high), <strong>red</strong> (critical).</p>',
    learnMore: '/help#staleness-scoring',
  },

  'updates-col-installed': {
    title: 'Installed Version',
    description:
      '<p>The version <strong>currently installed</strong> on the monitored system, as reported by the latest manifest push. This is the version you are running right now.</p>',
  },

  'updates-col-available': {
    title: 'Available Version',
    description:
      '<p>The <strong>latest upstream version</strong> detected by the release-checking workers. This is the version you would update to.</p>' +
      '<p>Click the version number to see the full list of available versions for this package, including intermediate releases.</p>',
  },

  'updates-col-cves': {
    title: 'CVE Count',
    description:
      '<p>The number of <strong>open CVEs</strong> affecting this package at its current installed version. Packages with CVEs should be prioritized for updates.</p>' +
      '<p>Click the count to see the specific CVE details, severity scores, and fix versions.</p>',
    learnMore: '/help#cves',
  },

  'updates-col-revdeps': {
    title: 'Reverse Dependencies',
    description:
      '<p>The number of other packages that <strong>depend on this one</strong>. Higher counts mean updating this package has a wider impact.</p>' +
      '<p>Packages with high reverse dependency counts may require a <strong>rebuild cascade</strong>  -  after updating the package, its dependents may need to be rebuilt against the new version. Plan these updates carefully, ideally in a batch.</p>',
    learnMore: '/help#dependencies',
  },

  'updates-col-days': {
    title: 'Days Outdated',
    description:
      '<p>The number of days since the <strong>upstream version was released</strong>. A longer period means the package has been outdated for longer and the update has been available for more time.</p>' +
      '<p>This is a factor in the staleness score  -  packages that have been outdated for many months score higher because the delay compounds risk.</p>',
  },

  'updates-bulk-checkbox': {
    title: 'Bulk Selection',
    description:
      '<p>Select multiple packages for <strong>bulk actions</strong>. When packages are selected, a bulk action bar appears at the bottom of the page.</p>' +
      '<p>Use the checkbox in the header row to select or deselect all visible packages at once. Bulk actions include <strong>Pin All</strong> and <strong>Defer All</strong> with a shared reason.</p>',
  },

  'updates-pin-btn': {
    title: 'Pin Button',
    description:
      '<p><strong>Pin this package</strong> to permanently exclude it from the outdated list. You\'ll be prompted for a reason explaining why the package is pinned.</p>' +
      '<p>Use pinning for packages you intentionally keep at a specific version. Pinned packages still receive CVE monitoring.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-defer-btn': {
    title: 'Defer Button',
    description:
      '<p><strong>Defer this package</strong> to temporarily hide it from the outdated list. Choose a duration: <strong>7</strong>, <strong>30</strong>, or <strong>90 days</strong>.</p>' +
      '<p>The package reappears after the deferral period or immediately if a CVE is found. Use deferral when you plan to update later but don\'t want the package cluttering the list now.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-bulk-bar': {
    title: 'Bulk Action Bar',
    description:
      '<p>Appears when one or more packages are selected via checkboxes. Available actions:</p>' +
      '<ul>' +
      '<li><strong>Pin All</strong>  -  Permanently exclude all selected packages. You\'ll provide a shared reason.</li>' +
      '<li><strong>Defer All</strong>  -  Temporarily hide all selected packages. Choose a duration (7, 30, or 90 days) and provide a shared reason.</li>' +
      '</ul>' +
      '<p>Bulk actions are useful for handling groups of related packages at once  -  for example, deferring all KDE packages until you\'re ready to update the desktop environment.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-score-colors': {
    title: 'Score Badge Colors',
    description:
      '<p>The staleness score badge is color-coded to indicate the <strong>urgency tier</strong>:</p>' +
      '<ul>' +
      '<li><strong style="color:#2a9d2a;">Green (0&ndash;4)</strong>  -  Low priority. Minor update, few risk factors.</li>' +
      '<li><strong style="color:#c5a800;">Yellow (5&ndash;14)</strong>  -  Medium priority. Notable update with some risk factors.</li>' +
      '<li><strong style="color:#e67e22;">Orange (15&ndash;24)</strong>  -  High priority. Significant update with multiple risk factors.</li>' +
      '<li><strong style="color:#e74c3c;">Red (25+)</strong>  -  Critical priority. Urgent update with severe risk factors (usually includes CVEs).</li>' +
      '</ul>',
    learnMore: '/help#staleness-scoring',
  },

  // --- CVEs page ------------------------------------------------------

  'cves-tab-actionable': {
    title: 'Fix Available',
    description:
      '<p>Confirmed CVEs where Vigil knows a fixed version or fixed range. This is the default remediation queue.</p>' +
      '<p>If your installed package is below the fixed version, update or rebuild that package. After the monitored system pushes a fresh manifest, the CVE resolver will clear links that are now past the affected range.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-unfixed': {
    title: 'No Fix Yet',
    description:
      '<p>Confirmed CVEs where the installed version is affected but no fixed version is known yet. These are real risks, but they are usually not solved by rebuilding the same current release.</p>' +
      '<p>Use this tab for monitoring, mitigation, and documented risk decisions. If upstream later publishes a fixed release, the CVE moves into <strong>Fix available</strong>.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-open': {
    title: 'Open',
    description:
      '<p>All confirmed open CVEs, combining <strong>Fix available</strong> and <strong>No fix yet</strong>. This is useful for footprint reporting, but not all rows are directly actionable.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-needs_triage': {
    title: 'Needs Triage',
    description:
      '<p>Unconfirmed package/CVE links. These are name matches, opaque commit ranges, missing range data, or legacy links without enough evidence to treat as confirmed exposure.</p>' +
      '<p>Review these before acting. If the advisory applies, update or document mitigation; if not, dismiss with a reason.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-dismissed': {
    title: 'Dismissed',
    description:
      '<p>CVEs you reviewed and suppressed with a reason, such as not applicable, false positive, mitigated by configuration, or accepted low risk. Dismissed CVEs can be reopened from the detail page.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-fixed': {
    title: 'Fixed',
    description:
      '<p>CVEs that were resolved because the installed package moved past the affected range or fixed version. Most fixed entries are managed automatically by the manifest push and CVE resolver pipeline.</p>',
    learnMore: '/help#cves',
  },

  'cves-tab-all': {
    title: 'All CVEs',
    description:
      '<p>Every CVE still linked to an installed package, regardless of remediation state. Use this for audit/review, not as a direct work queue.</p>',
    learnMore: '/help#cves',
  },

  'cves-action-summary': {
    title: 'Packages With Known Fix Targets',
    description:
      '<p>Package-first summary for the <strong>Fix available</strong> tab. It groups confirmed CVEs by affected package and shows the highest CVSS score so you can prioritize rebuild/update work.</p>' +
      '<p>Click a package chip to inspect package details, upstream releases, and linked CVEs before planning the rebuild.</p>',
    learnMore: '/help#cves',
  },

  'cves-unfixed-summary': {
    title: 'Current Packages, No Known Fix',
    description:
      '<p>These CVEs affect the installed/current package version, but the advisory does not yet identify a fixed release. If everything is already updated, these are expected to remain until upstream ships a fix or you dismiss them as not applicable.</p>' +
      '<p>Practical actions are monitoring upstream, applying configuration mitigations, reducing exposure, or recording accepted risk.</p>',
    learnMore: '/help#cves',
  },

  'cves-triage-summary': {
    title: 'Unconfirmed Matches',
    description:
      '<p>Rows in this view should not be treated as confirmed vulnerability exposure until reviewed. Common causes are fuzzy package-name matches, opaque commit ranges, missing fixed versions, or legacy NVD data.</p>',
    learnMore: '/help#cves',
  },

  'cves-search': {
    title: 'CVE Search',
    description:
      '<p>Search CVEs by <strong>CVE ID</strong> (e.g., <code>CVE-2024-12345</code>).</p>' +
      '<p>Use this to quickly find a specific CVE you\'ve seen mentioned in a security advisory or mailing list.</p>',
  },

  'cves-severity-filter': {
    title: 'Severity Filter',
    description:
      '<p>Filter CVEs by their <strong>CVSS severity level</strong>:</p>' +
      '<ul>' +
      '<li><strong>Critical (9.0&ndash;10.0)</strong>  -  Extremely dangerous. Typically allows remote code execution, privilege escalation, or complete system compromise with minimal effort.</li>' +
      '<li><strong>High (7.0&ndash;8.9)</strong>  -  Serious. Significant impact that requires attention but may have mitigating factors.</li>' +
      '<li><strong>Medium (4.0&ndash;6.9)</strong>  -  Moderate. Impact is limited by complexity, access requirements, or scope.</li>' +
      '<li><strong>Low (0.0&ndash;3.9)</strong>  -  Minor. Limited impact, difficult to exploit, or requires unusual conditions.</li>' +
      '</ul>',
    learnMore: '/help#cvss',
  },

  'cves-status-filter': {
    title: 'Status Filter',
    description:
      '<p>The CVE page now uses tabs instead of a status dropdown. Tabs separate remediation state from raw CVE status:</p>' +
      '<ul>' +
      '<li><strong>Fix available</strong>  -  confirmed affected and a fixed version/range is known</li>' +
      '<li><strong>No fix yet</strong>  -  confirmed affected, but no fixed version is known</li>' +
      '<li><strong>Needs triage</strong>  -  unconfirmed match requiring review</li>' +
      '<li><strong>Dismissed / Fixed / All</strong>  -  audit and history views</li>' +
      '</ul>',
    learnMore: '/help#cve-management',
  },

  'cves-col-id': {
    title: 'CVE ID',
    description:
      '<p>The unique <strong>CVE identifier</strong> assigned by a CVE Numbering Authority (e.g., <code>CVE-2024-12345</code>). Click to open the full CVE detail page.</p>' +
      '<p>The detail page shows the complete description, affected packages, fix versions, management actions, and external references.</p>',
  },

  'cves-col-packages': {
    title: 'Affected Packages',
    description:
      '<p>The packages on your system that are <strong>affected by this CVE</strong> at their current installed version. A single CVE can affect multiple packages (e.g., a library vulnerability may impact both the library itself and applications bundled with it).</p>',
  },

  'cves-col-source': {
    title: 'Advisory Source',
    description:
      '<p>The feed that produced the package/CVE link: <strong>NVD</strong>, <strong>OSV</strong>, <strong>Arch</strong>, or <strong>BLFS</strong>. Different feeds have different range quality, so this is useful when reviewing noisy or ambiguous matches.</p>',
    learnMore: '/help#cves',
  },

  'cves-col-range': {
    title: 'Affected Range',
    description:
      '<p>The version range reported by the advisory. <code>[*, 3.51.1)</code> means versions below 3.51.1 are affected; <code>[2.7, 2.43]</code> means 2.7 through 2.43 inclusive are affected.</p>' +
      '<p>When no fixed upper bound is known, the row belongs in <strong>No fix yet</strong> unless later feed data supplies a fixed version.</p>',
    learnMore: '/help#cves',
  },

  'cves-col-confidence': {
    title: 'Match Confidence',
    description:
      '<p><strong>exact</strong> means the installed package/version is confirmed against a comparable advisory range. <strong>fuzzy</strong> means the link is not confirmed and belongs in Needs triage.</p>' +
      '<p>Fuzzy links do not page as known exposure and should be reviewed before acting.</p>',
    learnMore: '/help#cves',
  },

  'cves-severity-badge': {
    title: 'Severity Badge',
    description:
      '<p>A color-coded badge showing the <strong>CVSS severity</strong> of this CVE:</p>' +
      '<ul>' +
      '<li><strong style="color:#e74c3c;">Critical</strong>  -  CVSS 9.0&ndash;10.0</li>' +
      '<li><strong style="color:#e67e22;">High</strong>  -  CVSS 7.0&ndash;8.9</li>' +
      '<li><strong style="color:#c5a800;">Medium</strong>  -  CVSS 4.0&ndash;6.9</li>' +
      '<li><strong style="color:#3498db;">Low</strong>  -  CVSS 0.0&ndash;3.9</li>' +
      '</ul>',
    learnMore: '/help#cvss',
  },

  'cves-cvss': {
    title: 'CVSS Score',
    description:
      '<p>The <strong>Common Vulnerability Scoring System</strong> score, ranging from <strong>0.0</strong> (no impact) to <strong>10.0</strong> (maximum severity).</p>' +
      '<p>The score is calculated from multiple factors:</p>' +
      '<ul>' +
      '<li><strong>Attack vector</strong>  -  Network, adjacent, local, or physical</li>' +
      '<li><strong>Attack complexity</strong>  -  Low or high</li>' +
      '<li><strong>Privileges required</strong>  -  None, low, or high</li>' +
      '<li><strong>User interaction</strong>  -  None or required</li>' +
      '<li><strong>Impact</strong>  -  Confidentiality, integrity, and availability impact</li>' +
      '</ul>',
    learnMore: '/help#cvss',
  },

  'cves-col-status': {
    title: 'CVE Status',
    description:
      '<p>The database management status of this CVE:</p>' +
      '<ul>' +
      '<li><strong>Open</strong>  -  still linked to an installed package; the tabs decide whether it is fixable now, unfixed upstream, or needs triage</li>' +
      '<li><strong>Dismissed</strong>  -  Reviewed and accepted or determined not applicable</li>' +
      '<li><strong>Fixed</strong>  -  Resolved by updating the affected package</li>' +
      '</ul>',
    learnMore: '/help#cve-management',
  },

  'cves-col-published': {
    title: 'Published Date',
    description:
      '<p>When the CVE was <strong>first published</strong> by the reporting authority (NVD, OSV, or Arch Security).</p>' +
      '<p>Recently published CVEs may not yet have complete information  -  CVSS scores and fix versions are sometimes added later as analysis continues.</p>',
  },

  // --- CVE Detail -----------------------------------------------------

  'cve-severity': {
    title: 'CVE Severity',
    description:
      '<p>The <strong>CVSS-based severity rating</strong> for this vulnerability: Critical, High, Medium, or Low.</p>' +
      '<p>This is derived from the CVSS score and gives a quick indication of how dangerous the vulnerability is. Critical and High severity CVEs should be addressed promptly.</p>',
    learnMore: '/help#cvss',
  },

  'cve-cvss-detail': {
    title: 'CVSS Score Detail',
    description:
      '<p>The detailed <strong>CVSS score breakdown</strong> for this CVE, showing the individual scoring factors that contribute to the overall score.</p>' +
      '<p>Understanding the breakdown helps you assess whether the vulnerability is relevant to your setup  -  for example, a high-scoring CVE that requires physical access may not be a concern for a machine behind a firewall.</p>',
    learnMore: '/help#cvss',
  },

  'cve-status-actions': {
    title: 'Status Actions',
    description:
      '<p>Actions to manage this CVE\'s status:</p>' +
      '<ul>' +
      '<li><strong>Dismiss</strong>  -  Mark as reviewed and hide from the open list. Use when you\'ve determined the CVE doesn\'t apply to your configuration (e.g., the affected feature is disabled, or the attack vector doesn\'t apply).</li>' +
      '<li><strong>Reopen</strong>  -  Bring a dismissed CVE back to open status. Use if new information changes your assessment.</li>' +
      '<li><strong>Fix</strong>  -  Manually mark as resolved. Normally this happens automatically when you update the package past its fix version via a manifest push.</li>' +
      '</ul>' +
      '<p>CVEs are also <strong>auto-fixed</strong> when a manifest push shows the affected package at or above the fixed version.</p>',
    learnMore: '/help#cve-management',
  },

  'cve-affected-packages': {
    title: 'Affected Packages',
    description:
      '<p>Packages on your system that are <strong>affected by this CVE</strong> at their currently installed version. Each entry shows the package name, installed version, and whether a fix version is known.</p>' +
      '<p>Click a package name to go to its detail page, where you can see all CVEs affecting that package and take action.</p>',
  },

  'cve-fixed-version': {
    title: 'Fixed Version',
    description:
      '<p>The <strong>version where this vulnerability is patched</strong>. Updating the affected package to this version or any newer version resolves the CVE.</p>' +
      '<p>If no fix version is shown, it means either the upstream hasn\'t released a patch yet, or the CVE databases don\'t have fix information. In this case, check the CVE references for the latest status.</p>',
    learnMore: '/help#cve-management',
  },

  'cve-references': {
    title: 'References',
    description:
      '<p>External links to the <strong>original CVE report</strong>, security advisories, patches, and related documentation.</p>' +
      '<p>Common reference sources include:</p>' +
      '<ul>' +
      '<li><strong>NVD</strong>  -  NIST\'s detailed CVE analysis page</li>' +
      '<li><strong>GitHub Advisory</strong>  -  GitHub Security Advisory</li>' +
      '<li><strong>Upstream bug tracker</strong>  -  The project\'s own issue or patch</li>' +
      '<li><strong>Arch Security</strong>  -  Arch Linux security advisory</li>' +
      '</ul>',
  },

  'cve-source': {
    title: 'CVE Source',
    description:
      '<p>Where this CVE was <strong>detected from</strong>. Vigil checks multiple vulnerability databases:</p>' +
      '<ul>' +
      '<li><strong>NVD</strong>  -  NIST National Vulnerability Database. The most comprehensive source with detailed CVSS scoring and CPE matching.</li>' +
      '<li><strong>OSV</strong>  -  Open Source Vulnerabilities database. Community-driven, often has faster coverage for open-source projects.</li>' +
      '<li><strong>Arch Security</strong>  -  Arch Linux Security Advisories. Curated by the Arch team, highly relevant for packages shared with Arch.</li>' +
      '</ul>',
    learnMore: '/help#cve-sources',
  },

  // --- Security page -------------------------------------------------

  // --- Activity page --------------------------------------------------

  'activity-total-pushes': {
    title: 'Total Manifest Pushes',
    description:
      '<p>The total number of <strong>manifest pushes</strong> received from the monitored system since monitoring began.</p>' +
      '<p>Each push syncs the complete list of installed packages and their versions. Pushes are triggered by your producer script, typically after building or updating packages.</p>',
    learnMore: '/help#manifest-push',
  },

  'activity-updated': {
    title: 'Packages Updated',
    description:
      '<p>The total number of <strong>package version changes</strong> detected across all manifest pushes. This counts every time a package\'s version changed between consecutive pushes.</p>' +
      '<p>This is a cumulative count  -  if a package was updated three times over the monitoring period, it counts as three updates.</p>',
  },

  'activity-added': {
    title: 'Packages Added',
    description:
      '<p>The total number of <strong>new packages</strong> detected across all manifest pushes. A package counts as "added" when it appears in a push but wasn\'t present in the previous one.</p>' +
      '<p>This typically happens when you build and install a new package on the monitored system.</p>',
  },

  'activity-removed': {
    title: 'Packages Removed',
    description:
      '<p>The total number of packages that <strong>disappeared from the manifest</strong> (no longer installed on the monitored system) across all pushes.</p>' +
      '<p>Removed packages are kept in the database with a "removed" status so their history is preserved, but they\'re excluded from the active package count and updates list.</p>',
  },

  'activity-auto-actions': {
    title: 'Automated Actions',
    description:
      '<p>Actions taken <strong>automatically by the system</strong> in response to manifest pushes and worker runs:</p>' +
      '<ul>' +
      '<li><strong>CVE auto-clears</strong>  -  A package was updated past a CVE\'s fix version, automatically marking the CVE as fixed</li>' +
      '<li><strong>CVE dismissals</strong>  -  System-triggered dismissals based on rules</li>' +
      '<li><strong>CVE reopens</strong>  -  A dismissed CVE was reopened because new information changed its status</li>' +
      '</ul>',
    learnMore: '/help#cve-management',
  },

  'activity-push-groups': {
    title: 'Push Groups',
    description:
      '<p>Manifest pushes <strong>grouped by time window</strong>, showing what changed in each push. Each group displays:</p>' +
      '<ul>' +
      '<li><strong>Timestamp</strong>  -  When the push was received</li>' +
      '<li><strong>Added</strong>  -  Newly installed packages</li>' +
      '<li><strong>Updated</strong>  -  Packages with version changes (shows old &rarr; new version)</li>' +
      '<li><strong>Removed</strong>  -  Packages no longer installed</li>' +
      '</ul>' +
      '<p>Click a push group to expand and see the full list of changes.</p>',
    learnMore: '/help#manifest-push',
  },

  'activity-change-details': {
    title: 'Change Details',
    description:
      '<p>Detailed breakdown of changes in a single manifest push:</p>' +
      '<ul>' +
      '<li><strong>Added</strong>  -  Newly installed packages with their version</li>' +
      '<li><strong>Updated</strong>  -  Packages where the version changed, showing the old version &rarr; new version transition</li>' +
      '<li><strong>Removed</strong>  -  Packages that are no longer installed on the monitored system</li>' +
      '</ul>',
  },

  'activity-auto-actions-details': {
    title: 'Auto Actions Details',
    description:
      '<p>Expanded detail panel showing the individual automated actions taken by the system, such as CVE auto-clears, dismissals, and reopens. Each entry includes the affected package, CVE ID, and reason.</p>',
    learnMore: '/help#cve-management',
  },

  'activity-auto-actions-summary': {
    title: 'Auto Actions Summary',
    description:
      '<p>A collapsible summary showing the total count of <strong>automated actions</strong> taken by the system. Click to expand and see individual action details.</p>',
    learnMore: '/help#cve-management',
  },

  'activity-auto-col-details': {
    title: 'Details Column',
    description:
      '<p>A description of the automated action, including the affected package and CVE ID. For auto-clears, shows which version resolved the CVE.</p>',
  },

  'activity-auto-col-time': {
    title: 'Time Column',
    description:
      '<p>When the automated action occurred. Times are shown relative to now (e.g., "2 hours ago") for recent actions.</p>',
  },

  'activity-auto-col-type': {
    title: 'Type Column',
    description:
      '<p>The category of automated action: <strong>auto-clear</strong> (CVE fixed by update), <strong>dismissal</strong> (rule-based CVE dismiss), or <strong>reopen</strong> (dismissed CVE reopened).</p>',
  },

  'activity-auto-type-badge': {
    title: 'Action Type Badge',
    description:
      '<p>A color-coded badge indicating the type of automated action. Green for auto-clears, gray for dismissals, and orange for reopens.</p>',
  },

  'activity-push-added': {
    title: 'Push Added Packages',
    description:
      '<p>Packages that were <strong>newly installed</strong> in this manifest push. These are packages present in this push but absent from the previous one.</p>',
  },

  'activity-push-group-summary': {
    title: 'Push Group Summary',
    description:
      '<p>A collapsible summary line for a manifest push, showing the timestamp and counts of added, updated, and removed packages. Click to expand and see the full list of changes.</p>',
    learnMore: '/help#manifest-push',
  },

  'activity-push-no-changes': {
    title: 'No Changes Push',
    description:
      '<p>Indicates that a manifest push was received but <strong>no package changes</strong> were detected compared to the previous push. The package list and versions were identical.</p>',
  },

  'activity-push-removed': {
    title: 'Push Removed Packages',
    description:
      '<p>Packages that were <strong>removed</strong> (uninstalled) in this manifest push. These were present in the previous push but absent from this one.</p>',
  },

  'activity-push-updated': {
    title: 'Push Updated Packages',
    description:
      '<p>Packages whose <strong>version changed</strong> between the previous push and this one. Shows the old version &rarr; new version transition for each updated package.</p>',
  },

  // --- Batches page ---------------------------------------------------

  'batches-new-form': {
    title: 'New Batch',
    description:
      '<p>Create a new <strong>update batch</strong> to plan and track a group of package updates. Two modes are available:</p>' +
      '<ul>' +
      '<li><strong>Auto-generate</strong>  -  The system selects packages for you based on a tier or category</li>' +
      '<li><strong>Manual</strong>  -  You specify exactly which packages to include</li>' +
      '</ul>' +
      '<p>Batches help you organize updates into manageable groups, track progress, and handle dependency ordering.</p>',
    learnMore: '/help#batches',
  },

  'batches-auto-generate': {
    title: 'Auto-Generate Batch',
    description:
      '<p>Let the system select packages for the batch based on a <strong>staleness tier or category</strong>:</p>' +
      '<ul>' +
      '<li><strong>By tier</strong>  -  Critical, High, or Medium staleness tier</li>' +
      '<li><strong>By category</strong>  -  Security (has CVEs), KDE, Core (LFS/BLFS), Apps, or Toolchain</li>' +
      '</ul>' +
      '<p>Packages are automatically <strong>ordered by dependency topology</strong> for safe update sequencing  -  dependencies are updated before the packages that depend on them.</p>',
    learnMore: '/help#batches',
  },

  'batches-manual': {
    title: 'Manual Batch',
    description:
      '<p>Manually specify which packages to include in the batch by entering a <strong>comma-separated list</strong> of package names.</p>' +
      '<p>Use this when you want precise control over which packages to update together  -  for example, a specific library and all its dependents, or a set of packages from the same upstream project.</p>',
    learnMore: '/help#batches',
  },

  'batches-status': {
    title: 'Batch Status',
    description:
      '<p>The current state of an update batch:</p>' +
      '<ul>' +
      '<li><strong>Planned</strong>  -  Batch has been created but no items have been completed yet</li>' +
      '<li><strong>In Progress</strong>  -  Some items have been marked as done or skipped</li>' +
      '<li><strong>Completed</strong>  -  All items in the batch are done or skipped</li>' +
      '</ul>',
    learnMore: '/help#batches',
  },

  'batches-progress': {
    title: 'Batch Progress',
    description:
      '<p>A visual <strong>progress bar</strong> showing how many items in the batch have been completed versus the total planned.</p>' +
      '<p>The bar fills as you mark individual items as "done" or "skipped." When all items are completed, the batch status changes to "Completed."</p>',
  },

  'batches-items': {
    title: 'Batch Items',
    description:
      '<p>The list of <strong>packages in this batch</strong> with their target versions and individual completion status.</p>' +
      '<p>Items are ordered by dependency topology when auto-generated  -  update packages at the top of the list first. Each item can be marked as done, skipped, or left pending.</p>',
    learnMore: '/help#batches',
  },

  'batches-item-status': {
    title: 'Item Status',
    description:
      '<p>The completion status of an individual package in the batch:</p>' +
      '<ul>' +
      '<li><strong>Pending</strong>  -  Not yet updated. This is the starting state.</li>' +
      '<li><strong>Done</strong>  -  Successfully updated to the target version.</li>' +
      '<li><strong>Skipped</strong>  -  Intentionally skipped (e.g., decided not to update this package, or it was updated outside the batch).</li>' +
      '</ul>',
  },

  'batches-versions': {
    title: 'Batch Versions',
    description:
      '<p>Shows the version transition for each package in the batch:</p>' +
      '<ul>' +
      '<li><strong>From</strong>  -  The currently installed version on the monitored system</li>' +
      '<li><strong>To</strong>  -  The target upstream version to update to</li>' +
      '</ul>' +
      '<p>These are snapshot values from when the batch was created. If the upstream releases a newer version after batch creation, the "To" version won\'t automatically update.</p>',
  },

  'batch-complete': {
    title: 'Complete Batch',
    description:
      '<p>Mark the entire batch as <strong>completed</strong>. This sets all remaining pending items to done and changes the batch status to "Completed."</p>',
    learnMore: '/help#batches',
  },

  'batch-completed-date': {
    title: 'Completed Date',
    description:
      '<p>The date when this batch was <strong>marked as completed</strong>. All items were either done or skipped by this date.</p>',
  },

  'batch-copy-markdown': {
    title: 'Copy as Markdown',
    description:
      '<p>Copy the batch contents as a <strong>Markdown-formatted checklist</strong> to your clipboard. Useful for pasting into notes, issue trackers, or build scripts to track progress outside Vigil.</p>',
  },

  'batch-created-date': {
    title: 'Created Date',
    description:
      '<p>The date when this batch was <strong>created</strong>. Package versions are snapshot at creation time.</p>',
  },

  'batch-dates': {
    title: 'Batch Dates',
    description:
      '<p>The <strong>created</strong> and <strong>completed</strong> dates for this batch. The time between these dates shows how long the update batch took to finish.</p>',
  },

  'batch-delete': {
    title: 'Delete Batch',
    description:
      '<p><strong>Permanently delete</strong> this batch and all its items. This action cannot be undone. Deleting a batch does not affect the packages themselves  -  it only removes the batch tracking record.</p>',
    learnMore: '/help#batches',
  },

  'batches-auto-mode': {
    title: 'Auto Mode',
    description:
      '<p>The <strong>auto-generate</strong> batch creation mode. The system selects outdated packages based on a staleness tier or category, and orders them by dependency topology for safe update sequencing.</p>',
    learnMore: '/help#batches',
  },

  'batches-category-label': {
    title: 'Category Label',
    description:
      '<p>Label for the category selector when auto-generating a batch.</p>',
  },

  'batches-category-select': {
    title: 'Category Select',
    description:
      '<p>Choose a <strong>category</strong> for auto-generating the batch: Security (packages with CVEs), KDE, Core (LFS/BLFS), Apps, or Toolchain. Only outdated packages in the selected category will be included.</p>',
    learnMore: '/help#batches',
  },

  'batches-col-completed': {
    title: 'Completed Column',
    description:
      '<p>The date when the batch was <strong>completed</strong>, or empty if the batch is still in progress or planned.</p>',
  },

  'batches-col-created': {
    title: 'Created Column',
    description:
      '<p>The date when the batch was <strong>created</strong>.</p>',
  },

  'batches-col-name': {
    title: 'Name Column',
    description:
      '<p>The <strong>name</strong> of the batch. Click to open the batch detail page where you can track individual item progress.</p>',
  },

  'batches-col-progress': {
    title: 'Progress Column',
    description:
      '<p>A <strong>progress bar</strong> showing completed items versus total items in the batch, along with a percentage.</p>',
  },

  'batches-create-auto': {
    title: 'Create Auto Batch',
    description:
      '<p>Create a batch by <strong>auto-selecting</strong> packages based on the chosen tier or category. Packages are ordered by dependency topology.</p>',
    learnMore: '/help#batches',
  },

  'batches-create-manual': {
    title: 'Create Manual Batch',
    description:
      '<p>Create a batch with a <strong>manually specified</strong> list of packages. Enter package names as a comma-separated list.</p>',
    learnMore: '/help#batches',
  },

  'batches-filter-all': {
    title: 'Show All Batches',
    description:
      '<p>Show <strong>all batches</strong> regardless of status  -  planned, in progress, and completed.</p>',
  },

  'batches-filter-completed': {
    title: 'Show Completed',
    description:
      '<p>Show only <strong>completed</strong> batches where all items have been marked done or skipped.</p>',
  },

  'batches-filter-in-progress': {
    title: 'Show In Progress',
    description:
      '<p>Show only batches that are <strong>in progress</strong>  -  some items completed but not all.</p>',
  },

  'batches-filter-planned': {
    title: 'Show Planned',
    description:
      '<p>Show only <strong>planned</strong> batches that have been created but no items have been completed yet.</p>',
  },

  'batches-manual-mode': {
    title: 'Manual Mode',
    description:
      '<p>The <strong>manual</strong> batch creation mode. You specify exactly which packages to include by entering a comma-separated list of package names.</p>',
    learnMore: '/help#batches',
  },

  'batches-name-input': {
    title: 'Batch Name Input',
    description:
      '<p>Enter a <strong>descriptive name</strong> for the batch. Use a name that identifies the purpose, such as "KDE Frameworks 6.10 update" or "Security fixes March 2026."</p>',
  },

  'batches-name-label': {
    title: 'Batch Name Label',
    description:
      '<p>Label for the batch name input field.</p>',
  },

  'batches-packages-label': {
    title: 'Packages Label',
    description:
      '<p>Label for the manual package list textarea.</p>',
  },

  'batches-packages-textarea': {
    title: 'Packages Textarea',
    description:
      '<p>Enter a <strong>comma-separated list</strong> of package names to include in the batch. Only packages that are currently outdated will be added. Invalid or up-to-date package names are ignored.</p>',
  },

  'batches-tier-label': {
    title: 'Tier Label',
    description:
      '<p>Label for the staleness tier selector when auto-generating a batch.</p>',
  },

  'batches-tier-select': {
    title: 'Tier Select',
    description:
      '<p>Choose a <strong>staleness tier</strong> for auto-generating the batch: Critical, High, or Medium. Only outdated packages at or above the selected tier will be included.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'batch-progress-bar': {
    title: 'Batch Progress Bar',
    description:
      '<p>A visual <strong>progress bar</strong> showing how many items in the batch have been completed. Fills as items are marked done or skipped.</p>',
  },

  'batch-status-completed': {
    title: 'Completed Status',
    description:
      '<p>This batch is <strong>completed</strong>  -  all items have been marked as done or skipped. The batch is now read-only.</p>',
  },

  'batch-status-in-progress': {
    title: 'In Progress Status',
    description:
      '<p>This batch is <strong>in progress</strong>  -  some items have been completed but others are still pending.</p>',
  },

  'batch-status-planned': {
    title: 'Planned Status',
    description:
      '<p>This batch is <strong>planned</strong>  -  it has been created but no items have been completed yet. Start working through the items to move the batch to "in progress."</p>',
  },

  // --- Graph page -----------------------------------------------------

  'graph-search': {
    title: 'Graph Search',
    description:
      '<p>Search for a package to <strong>center the dependency graph</strong> on. Uses autocomplete to suggest package names as you type.</p>' +
      '<p>Select a package to see its dependency tree visualized as an interactive graph. The graph shows both direct dependencies and reverse dependencies.</p>',
    learnMore: '/help#graph',
  },

  'graph-depth': {
    title: 'Graph Depth',
    description:
      '<p>Controls how many <strong>levels of dependencies</strong> to display in the graph:</p>' +
      '<ul>' +
      '<li><strong>Depth 1</strong>  -  Only direct dependencies and reverse dependencies</li>' +
      '<li><strong>Depth 2</strong>  -  Also includes dependencies of dependencies (two levels deep)</li>' +
      '<li><strong>Depth 3</strong>  -  Three levels deep, showing the broader dependency ecosystem</li>' +
      '</ul>' +
      '<p>Higher depths show more context but can make the graph crowded for packages with many dependencies. Start with depth 1 and increase if needed.</p>',
    learnMore: '/help#graph',
  },

  'graph-highlight-outdated': {
    title: 'Highlight Outdated',
    description:
      '<p>When enabled, packages that are <strong>outdated</strong> (newer upstream version available) are highlighted with <strong>orange borders</strong> in the graph visualization.</p>' +
      '<p>This helps you visualize which parts of the dependency tree are affected by outdated packages and identify update cascades  -  where updating one package may require updating its dependents.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend': {
    title: 'Graph Legend',
    description:
      '<p>Color meanings for nodes in the dependency graph:</p>' +
      '<ul>' +
      '<li><strong style="color:#3498db;">Blue</strong>  -  The selected/centered package</li>' +
      '<li><strong style="color:#2ecc71;">Green</strong>  -  Direct dependency (this package depends on it)</li>' +
      '<li><strong style="color:#1abc9c;">Teal</strong>  -  Indirect dependency (dependency of a dependency)</li>' +
      '<li><strong style="color:#e67e22;">Orange</strong>  -  Reverse dependency (depends on the selected package)</li>' +
      '</ul>',
    learnMore: '/help#graph',
  },

  'graph-visualization': {
    title: 'Dependency Graph',
    description:
      '<p>An interactive <strong>force-directed graph</strong> showing package dependency relationships. Powered by D3.js.</p>' +
      '<p>Interactions:</p>' +
      '<ul>' +
      '<li><strong>Drag</strong> nodes to rearrange the layout</li>' +
      '<li><strong>Hover</strong> over a node to see package details (name, version, status)</li>' +
      '<li><strong>Click</strong> a node to recenter the graph on that package</li>' +
      '<li><strong>Scroll</strong> to zoom in and out</li>' +
      '</ul>' +
      '<p>Arrows indicate the direction of dependency: an arrow from A to B means "A depends on B."</p>',
    learnMore: '/help#graph',
  },

  // --- Coverage page -------------------------------------------------

  'coverage-overall': {
    title: 'Overall Coverage',
    description:
      '<p>The percentage of installed packages that have at least one <strong>upstream source configured</strong> for version monitoring.</p>' +
      '<p>100% coverage means every package is being actively checked for new upstream releases. Packages without upstream sources are invisible to the update system  -  you won\'t know when new versions are available.</p>' +
      '<p>Aim for as close to 100% as practical. Some packages (meta-packages, custom local packages) may not have meaningful upstreams to track.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-group-bars': {
    title: 'Group Coverage',
    description:
      '<p>Coverage breakdown <strong>by package group</strong>, shown as horizontal bars. Each bar shows what percentage of packages in that group have upstream monitoring configured.</p>' +
      '<p>Groups with low coverage have the most unmonitored packages  -  focus on adding upstream sources to those groups first for the biggest improvement in coverage.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-unmonitored': {
    title: 'Unmonitored Packages',
    description:
      '<p>Packages <strong>without any upstream source</strong> configured. These packages won\'t appear on the Updates page even if newer versions exist, because there\'s no configured way to check.</p>' +
      '<p>For each unmonitored package, you can click through to add an upstream source  -  configuring a GitHub repo, GitLab project, GNU FTP path, PyPI package name, or custom URL.</p>',
    learnMore: '/help#upstream-sources',
  },

  'coverage-add-upstream': {
    title: 'Add Upstream Source',
    description:
      '<p>Link to <strong>add an upstream source</strong> for this unmonitored package. Takes you to the package detail page where you can configure version checking.</p>' +
      '<p>You\'ll need to choose a source type (GitHub, GitLab, GNU, PyPI, Kernel, KDE, or Generic) and provide the relevant configuration (repo URL, project name, etc.). Once configured, the next worker run will check for available versions.</p>',
    learnMore: '/help#upstream-sources',
  },

  'coverage-add-source': {
    title: 'Add Source Button',
    description:
      '<p>Quick action to <strong>add an upstream source</strong> for an unmonitored package. Opens the package detail page where you can configure version checking.</p>',
    learnMore: '/help#upstream-sources',
  },

  'coverage-by-group': {
    title: 'Coverage by Group',
    description:
      '<p>A table showing <strong>upstream monitoring coverage</strong> broken down by package group. Each row shows the group name, total packages, covered (monitored) count, and coverage percentage with a progress bar.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-coverage-col': {
    title: 'Coverage Column',
    description:
      '<p>The <strong>coverage percentage</strong> for this group, shown as a number and a progress bar. Higher percentages mean more packages in the group have upstream monitoring configured.</p>',
  },

  'coverage-covered-col': {
    title: 'Covered Column',
    description:
      '<p>The number of packages in this group that <strong>have upstream monitoring</strong> configured. These packages are actively checked for new releases.</p>',
  },

  'coverage-group-badge': {
    title: 'Group Badge',
    description:
      '<p>A badge showing the <strong>package group</strong> name. Groups categorize packages by their role on the monitored system (e.g., lfs, kde-frameworks, toolchain).</p>',
  },

  'coverage-group-col': {
    title: 'Group Column',
    description:
      '<p>The <strong>package group name</strong> for this coverage row.</p>',
  },

  'coverage-monitored-count': {
    title: 'Monitored Count',
    description:
      '<p>The total number of packages that <strong>have upstream monitoring</strong> configured across all groups. These packages are actively checked for new releases by the release-checking workers.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-percentage': {
    title: 'Coverage Percentage',
    description:
      '<p>The overall <strong>percentage of packages</strong> with upstream monitoring configured. Calculated as monitored packages divided by total packages.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-progress-bar': {
    title: 'Coverage Progress Bar',
    description:
      '<p>A visual bar showing the <strong>coverage percentage</strong> for a group. Green fill indicates the proportion of packages with upstream monitoring.</p>',
  },

  'coverage-total-col': {
    title: 'Total Column',
    description:
      '<p>The <strong>total number of packages</strong> in this group, including both monitored and unmonitored packages.</p>',
  },

  'coverage-total-count': {
    title: 'Total Package Count',
    description:
      '<p>The <strong>total number of packages</strong> being tracked across all groups. This is the denominator used to calculate the overall coverage percentage.</p>',
  },

  'coverage-unmon-actions-col': {
    title: 'Actions Column',
    description:
      '<p>Quick actions for unmonitored packages. Typically includes an <strong>"Add source"</strong> link to configure upstream monitoring for the package.</p>',
  },

  'coverage-unmon-groups-col': {
    title: 'Groups Column',
    description:
      '<p>The <strong>package groups</strong> the unmonitored package belongs to. Helps identify which category of packages needs monitoring attention.</p>',
  },

  'coverage-unmonitored-count': {
    title: 'Unmonitored Count',
    description:
      '<p>The number of packages <strong>without upstream monitoring</strong>. These packages are invisible to the update system  -  new releases won\'t be detected until a source is configured.</p>',
    learnMore: '/help#coverage',
  },

  'coverage-unmon-package-col': {
    title: 'Package Column',
    description:
      '<p>The <strong>name</strong> of an unmonitored package. Click to open its detail page where you can configure an upstream source.</p>',
  },

  'coverage-unmon-version-col': {
    title: 'Version Column',
    description:
      '<p>The <strong>currently installed version</strong> of this unmonitored package, as reported by the latest manifest push.</p>',
  },

  // --- KB page --------------------------------------------------------

  'kb-search': {
    title: 'KB Search',
    description:
      '<p>Search knowledge base articles by <strong>title or content</strong>. The search is case-insensitive and matches partial text.</p>' +
      '<p>Use this to quickly find articles about specific packages, build issues, or workarounds.</p>',
  },

  'kb-tag-filter': {
    title: 'Tag Filter',
    description:
      '<p>Filter knowledge base articles by <strong>tag</strong>. Common tags include:</p>' +
      '<ul>' +
      '<li><code>security</code>  -  Security-related notes and procedures</li>' +
      '<li><code>build-fix</code>  -  Build fixes and patches for specific packages</li>' +
      '<li><code>workaround</code>  -  Temporary workarounds for known issues</li>' +
      '</ul>' +
      '<p>Articles can have multiple tags. Selecting a tag shows only articles with that tag.</p>',
  },

  'kb-article-list': {
    title: 'Knowledge Base Articles',
    description:
      '<p>The list of <strong>knowledge base articles</strong>  -  admin-created reference documents about packages, build fixes, workarounds, or procedures.</p>' +
      '<p>Articles are written in Markdown and can be linked to specific packages. When an article is linked to a package, it appears on that package\'s detail page for easy reference.</p>',
    learnMore: '/help#knowledge-base',
  },

  'kb-new-article': {
    title: 'New Article',
    description:
      '<p>Create a new knowledge base article. Required fields:</p>' +
      '<ul>' +
      '<li><strong>Title</strong>  -  A descriptive title for the article</li>' +
      '<li><strong>Slug</strong>  -  URL-friendly identifier (e.g., <code>mesa-build-fix-2024</code>)</li>' +
      '<li><strong>Body</strong>  -  Article content in Markdown format</li>' +
      '<li><strong>Tags</strong>  -  Categorization tags (comma-separated)</li>' +
      '<li><strong>Linked packages</strong>  -  Optional list of packages this article relates to</li>' +
      '</ul>',
    learnMore: '/help#knowledge-base',
  },

  'kb-linked-packages': {
    title: 'Linked Packages',
    description:
      '<p>Packages <strong>associated with this article</strong>. When a KB article is linked to a package, a reference to the article appears on the package\'s detail page.</p>' +
      '<p>This creates cross-references  -  from the KB you can jump to affected packages, and from a package detail page you can find relevant KB articles about build fixes, workarounds, or notes.</p>',
  },

  // --- Advisories page -----------------------------------------------

  'advisories-active-badge': {
    title: 'Active Badge',
    description:
      '<p>Indicates this advisory is <strong>currently active</strong> and the issue it describes has not yet been resolved. Active advisories appear by default in the list.</p>',
    learnMore: '/help#advisories',
  },

  'advisories-col-created': {
    title: 'Created Column',
    description:
      '<p>The date when this advisory was <strong>first created</strong>. Advisories are sorted by creation date (newest first) by default.</p>',
  },

  'advisories-col-kb-article': {
    title: 'KB Article Column',
    description:
      '<p>A link to the <strong>knowledge base article</strong> associated with this advisory, if one exists. KB articles provide detailed context, workarounds, or procedures related to the advisory.</p>',
    learnMore: '/help#knowledge-base',
  },

  'advisories-col-packages': {
    title: 'Packages Column',
    description:
      '<p>The packages <strong>affected by this advisory</strong>, shown as clickable badges. Click a package name to visit its detail page.</p>',
  },

  'advisories-col-severity': {
    title: 'Severity Column',
    description:
      '<p>The severity level of the advisory: <strong>Critical</strong> (red), <strong>Warning</strong> (orange), or <strong>Info</strong> (blue). Determines how prominently the advisory is displayed.</p>',
    learnMore: '/help#advisories',
  },

  'advisories-col-status': {
    title: 'Status Column',
    description:
      '<p>Whether the advisory is <strong>active</strong> (ongoing issue) or <strong>resolved</strong> (issue addressed). Resolved advisories are hidden by default.</p>',
  },

  'advisories-col-title': {
    title: 'Title Column',
    description:
      '<p>The brief <strong>title</strong> of the advisory summarizing the issue. Click to open the full advisory detail page.</p>',
  },

  'advisories-resolved-badge': {
    title: 'Resolved Badge',
    description:
      '<p>Indicates this advisory has been <strong>resolved</strong>. The issue it described has been addressed and no further action is needed. Resolved advisories are hidden by default but can be shown using the resolved filter.</p>',
    learnMore: '/help#advisories',
  },

  'advisories-status-filter': {
    title: 'Status Filter',
    description:
      '<p>Filter advisories by status: <strong>Active</strong> (current issues requiring attention) or <strong>All</strong> (including resolved advisories). Active advisories are shown by default.</p>',
    learnMore: '/help#advisories',
  },

  'advisories-severity-filter': {
    title: 'Severity Filter',
    description:
      '<p>Filter advisories by <strong>severity level</strong>:</p>' +
      '<ul>' +
      '<li><strong style="color:#e74c3c;">Critical</strong>  -  Security risk or breaking issue requiring immediate action</li>' +
      '<li><strong style="color:#e67e22;">Warning</strong>  -  Caution needed, potential issues to be aware of</li>' +
      '<li><strong style="color:#3498db;">Info</strong>  -  Informational note, no action required</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  'advisories-resolved-filter': {
    title: 'Resolved Filter',
    description:
      '<p>Toggle whether to show <strong>resolved advisories</strong>:</p>' +
      '<ul>' +
      '<li><strong>Active</strong>  -  Only show current, unresolved advisories</li>' +
      '<li><strong>Include Resolved</strong>  -  Show all advisories, including those that have been resolved</li>' +
      '</ul>' +
      '<p>Resolved advisories are kept for historical reference but hidden by default to reduce clutter.</p>',
  },

  'advisories-new': {
    title: 'New Advisory',
    description:
      '<p>Create a new advisory to <strong>flag an issue</strong> for one or more packages. Set the following:</p>' +
      '<ul>' +
      '<li><strong>Severity</strong>  -  Critical, Warning, or Info</li>' +
      '<li><strong>Title</strong>  -  Brief summary of the advisory</li>' +
      '<li><strong>Description</strong>  -  Detailed explanation of the issue, impact, and recommended action</li>' +
      '<li><strong>Affected packages</strong>  -  Which packages this advisory applies to</li>' +
      '<li><strong>Linked KB article</strong>  -  Optional reference to a knowledge base article with more details</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  'advisories-severity-badge': {
    title: 'Advisory Severity',
    description:
      '<p>The severity level of an advisory:</p>' +
      '<ul>' +
      '<li><strong style="color:#e74c3c;">Critical (red)</strong>  -  Security risk or breaking issue. These are serious problems that require immediate attention, such as a package with a known exploit or a build that produces broken binaries.</li>' +
      '<li><strong style="color:#e67e22;">Warning (orange)</strong>  -  Caution required. Issues that don\'t require immediate action but should be considered, such as deprecated build flags or upcoming breaking changes.</li>' +
      '<li><strong style="color:#3498db;">Info (blue)</strong>  -  Informational note. No action needed, but useful to know  -  such as an upstream project rename or a new optional dependency.</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  'advisories-affected-pkgs': {
    title: 'Affected Packages',
    description:
      '<p>The packages <strong>affected by this advisory</strong>, shown as clickable pills. Click a package name to go to its detail page.</p>' +
      '<p>An advisory can affect multiple packages  -  for example, a security advisory about a shared library might list the library itself plus all applications that statically link it.</p>',
  },

  'advisories-status': {
    title: 'Advisory Status',
    description:
      '<p>Whether the advisory is <strong>active or resolved</strong>:</p>' +
      '<ul>' +
      '<li><strong>Active</strong>  -  The issue described in the advisory is still current and relevant</li>' +
      '<li><strong>Resolved</strong>  -  The issue has been addressed (e.g., the package was updated, the workaround was applied). Resolved advisories are hidden by default.</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  // --- Advisory Detail/Form ------------------------------------------

  'advisory-affected-packages': {
    title: 'Affected Packages',
    description:
      '<p>The packages <strong>affected by this advisory</strong>. Each package is shown as a clickable link to its detail page. An advisory can affect one or many packages.</p>',
  },

  'advisory-created': {
    title: 'Created Date',
    description:
      '<p>The date when this advisory was <strong>originally created</strong>.</p>',
  },

  'advisory-delete': {
    title: 'Delete Advisory',
    description:
      '<p><strong>Permanently delete</strong> this advisory. This action cannot be undone. A confirmation dialog will appear before deletion proceeds.</p>',
  },

  'advisory-delete-cancel': {
    title: 'Cancel Delete',
    description:
      '<p>Cancel the delete operation and return to the advisory without making changes.</p>',
  },

  'advisory-delete-confirm': {
    title: 'Confirm Delete',
    description:
      '<p>Confirm permanent deletion of this advisory. If the "also delete linked KB article" checkbox is checked, the associated knowledge base article will also be removed.</p>',
  },

  'advisory-delete-kb-checkbox': {
    title: 'Delete KB Article Checkbox',
    description:
      '<p>When checked, the <strong>linked KB article</strong> (if any) will also be deleted along with the advisory. Leave unchecked to keep the KB article even after the advisory is removed.</p>',
  },

  'advisory-delete-modal': {
    title: 'Delete Confirmation',
    description:
      '<p>A confirmation dialog that appears before deleting an advisory. Shows the advisory title and gives you the option to also delete the linked KB article. You must confirm to proceed.</p>',
  },

  'advisory-description': {
    title: 'Advisory Description',
    description:
      '<p>The full <strong>description</strong> of the advisory, explaining the issue, its impact, and any recommended actions. Supports HTML formatting.</p>',
  },

  'advisory-edit': {
    title: 'Edit Advisory',
    description:
      '<p>Open the <strong>edit form</strong> to modify this advisory\'s title, severity, description, affected packages, or linked KB article.</p>',
  },

  'advisory-form-cancel': {
    title: 'Cancel',
    description:
      '<p>Discard changes and return to the previous page without saving.</p>',
  },

  'advisory-form-description-label': {
    title: 'Description Label',
    description:
      '<p>Label for the advisory description field. The description should explain the issue in detail, including its impact and any recommended actions.</p>',
  },

  'advisory-form-description-textarea': {
    title: 'Description Field',
    description:
      '<p>Enter the <strong>full description</strong> of the advisory. Supports HTML formatting for rich text. Include details about the issue, affected versions, and recommended actions or workarounds.</p>',
  },

  'advisory-form-kb-hint': {
    title: 'KB Article Hint',
    description:
      '<p>Optional. Link a <strong>knowledge base article</strong> to this advisory for additional context, detailed procedures, or workarounds.</p>',
  },

  'advisory-form-kb-label': {
    title: 'KB Article Label',
    description:
      '<p>Label for the optional KB article link field.</p>',
  },

  'advisory-form-kb-select': {
    title: 'KB Article Select',
    description:
      '<p>Select an existing <strong>knowledge base article</strong> to link to this advisory. The linked article will be accessible from the advisory detail page.</p>',
    learnMore: '/help#knowledge-base',
  },

  'advisory-form-packages-hint': {
    title: 'Packages Hint',
    description:
      '<p>Select one or more packages that are affected by this advisory. The advisory will appear on each selected package\'s detail page.</p>',
  },

  'advisory-form-packages-label': {
    title: 'Packages Label',
    description:
      '<p>Label for the affected packages selection field.</p>',
  },

  'advisory-form-packages-select': {
    title: 'Packages Select',
    description:
      '<p>A multi-select dropdown to choose which <strong>packages are affected</strong> by this advisory. Selected packages will show an advisory badge on the Packages page.</p>',
  },

  'advisory-form-severity-label': {
    title: 'Severity Label',
    description:
      '<p>Label for the severity level selection.</p>',
  },

  'advisory-form-severity-select': {
    title: 'Severity Select',
    description:
      '<p>Choose the <strong>severity level</strong> for this advisory: <strong>Critical</strong> (security risk or breaking issue), <strong>Warning</strong> (caution needed), or <strong>Info</strong> (informational note).</p>',
    learnMore: '/help#advisories',
  },

  'advisory-form-submit': {
    title: 'Save Advisory',
    description:
      '<p>Save the advisory with the current form values. Creates a new advisory or updates an existing one.</p>',
  },

  'advisory-form-title-input': {
    title: 'Title Input',
    description:
      '<p>Enter a brief, descriptive <strong>title</strong> for the advisory. This appears in the advisory list and as the heading on the detail page.</p>',
  },

  'advisory-form-title-label': {
    title: 'Title Label',
    description:
      '<p>Label for the advisory title field.</p>',
  },

  'advisory-kb-article': {
    title: 'Linked KB Article',
    description:
      '<p>The <strong>knowledge base article</strong> linked to this advisory. Provides additional detail, procedures, or workarounds related to the advisory\'s topic.</p>',
    learnMore: '/help#knowledge-base',
  },

  'advisory-mark-resolved': {
    title: 'Mark Resolved',
    description:
      '<p>Mark this advisory as <strong>resolved</strong>, indicating the issue has been addressed. Resolved advisories are hidden by default but can be viewed using the resolved filter on the advisories list.</p>',
    learnMore: '/help#advisories',
  },

  'advisory-resolved-badge': {
    title: 'Resolved Badge',
    description:
      '<p>A badge indicating this advisory has been <strong>resolved</strong>. The issue it describes has been addressed and no further action is needed.</p>',
  },

  'advisory-resolved-date': {
    title: 'Resolved Date',
    description:
      '<p>The date when this advisory was <strong>marked as resolved</strong>.</p>',
  },

  'advisory-severity-badge': {
    title: 'Severity Badge',
    description:
      '<p>A color-coded badge showing the advisory\'s severity: <strong>Critical</strong> (red), <strong>Warning</strong> (orange), or <strong>Info</strong> (blue).</p>',
    learnMore: '/help#advisories',
  },

  'advisory-updated': {
    title: 'Last Updated',
    description:
      '<p>The date when this advisory was <strong>last modified</strong>. Shows when the title, description, severity, or affected packages were last changed.</p>',
  },

  'advisory-view-full-article': {
    title: 'View Full Article',
    description:
      '<p>Open the linked <strong>knowledge base article</strong> in full. Takes you to the KB article page with the complete content, including any code samples, procedures, or detailed explanations.</p>',
    learnMore: '/help#knowledge-base',
  },

  // --- Settings page -------------------------------------------------

  'settings-system-status': {
    title: 'System Status',
    description:
      '<p>A quick overview of the system\'s current state:</p>' +
      '<ul>' +
      '<li><strong>Total packages</strong>  -  Number of packages being tracked</li>' +
      '<li><strong>Last manifest push</strong>  -  When the monitored system last synced</li>' +
      '<li><strong>Upstream sources</strong>  -  Number of configured version monitoring sources</li>' +
      '<li><strong>Open CVEs</strong>  -  Number of unresolved security vulnerabilities</li>' +
      '</ul>',
    learnMore: '/help#settings',
  },

  'settings-api-key': {
    title: 'API Key',
    description:
      '<p>The <strong>HMAC API key</strong> used by the monitored system to authenticate manifest pushes. The producer signs each request with this key using HMAC-SHA256.</p>' +
      '<p><strong>Keep this secret.</strong> Anyone with this key can push manifest data to your Vigil instance. If compromised, generate a new key and update your producer\'s configuration.</p>' +
      '<p>The key is stored in the <code>.env</code> file on the server and in your producer\'s configuration.</p>',
    learnMore: '/help#api-auth',
  },

  'settings-workers-table': {
    title: 'Workers',
    description:
      '<p>All <strong>16 background workers</strong> with their descriptions, schedules, and current status. Workers are grouped by function:</p>' +
      '<ul>' +
      '<li><strong>Release checkers (8)</strong>  -  Check GitHub, GitLab, GNU, PyPI, KDE, kernel.org, Flathub, and generic URLs for new versions</li>' +
      '<li><strong>CVE scanners (4)</strong>  -  Scan NVD, OSV, Arch Security, and BLFS errata for vulnerabilities</li>' +
      '<li><strong>System (4)</strong>  -  Calculate staleness scores, resolve CVE aliases, send digest emails, and prune old data</li>' +
      '</ul>',
    learnMore: '/help#workers',
  },

  'settings-worker-schedule': {
    title: 'Worker Schedule',
    description:
      '<p>How often this worker runs. Schedules vary by worker type:</p>' +
      '<ul>' +
      '<li><strong>Release checkers</strong>  -  Typically every 2 hours</li>' +
      '<li><strong>CVE scanners</strong>  -  Every 4&ndash;6 hours</li>' +
      '<li><strong>System workers</strong>  -  Varies (staleness scorer: every 4h, digest: weekly)</li>' +
      '</ul>' +
      '<p>Schedules are configured in the worker registry and can be adjusted in the source code.</p>',
    learnMore: '/help#workers',
  },

  'settings-run-now': {
    title: 'Run Worker Now',
    description:
      '<p>Trigger this worker to <strong>run immediately</strong> instead of waiting for its next scheduled execution.</p>' +
      '<p>Useful for:</p>' +
      '<ul>' +
      '<li>Getting fresh upstream version data after configuring a new source</li>' +
      '<li>Re-scanning for CVEs after a security advisory is published</li>' +
      '<li>Recomputing staleness scores after changing multipliers</li>' +
      '<li>Testing worker configuration changes</li>' +
      '</ul>' +
      '<p>The worker runs asynchronously  -  results will appear on the relevant pages once processing completes.</p>',
    learnMore: '/help#workers',
  },

  'settings-email-alerts': {
    title: 'Email Alerts',
    description:
      '<p>Configure which <strong>email notifications</strong> are enabled:</p>' +
      '<ul>' +
      '<li><strong>New CVE alerts</strong>  -  Immediate email when a CVE with CVSS &ge; 7.0 is matched to your packages</li>' +
      '<li><strong>Weekly digest</strong>  -  Summary of outdated packages, new CVEs, and system health sent once per week</li>' +
      '<li><strong>Watch alerts</strong>  -  Email when a new upstream version is detected for packages you\'re watching</li>' +
      '<li><strong>Worker failure alerts</strong>  -  Email when a background worker fails repeatedly</li>' +
      '</ul>' +
      '<p>Email is sent via SMTP configured in the server\'s <code>.env</code> file.</p>',
    learnMore: '/help#notifications',
  },

  // --- CVE Detail (additional) --------------------------------------

  'cve-description': {
    title: 'CVE Description',
    description:
      '<p>The full <strong>vulnerability description</strong> from the reporting authority (NVD, OSV, or Arch Security). This explains what the vulnerability is, how it can be exploited, and what impact it has.</p>' +
      '<p>Descriptions may be updated over time as analysis continues. Early reports sometimes have sparse details that are filled in later.</p>',
    learnMore: '/help#cves',
  },

  'cve-detail-cvss': {
    title: 'CVSS Score',
    description:
      '<p>The <strong>CVSS score</strong> for this CVE, ranging from 0.0 to 10.0. Higher scores indicate more severe vulnerabilities.</p>' +
      '<p>The score is calculated from attack vector, complexity, privileges required, user interaction, and impact on confidentiality, integrity, and availability.</p>',
    learnMore: '/help#cvss',
  },

  'cve-detail-published': {
    title: 'Published Date',
    description:
      '<p>When this CVE was <strong>first published</strong> by the reporting authority. Recently published CVEs may not yet have complete CVSS scores or fix version information.</p>',
  },

  'cve-detail-severity': {
    title: 'Severity Level',
    description:
      '<p>The <strong>severity classification</strong> derived from the CVSS score: Critical (9.0&ndash;10.0), High (7.0&ndash;8.9), Medium (4.0&ndash;6.9), or Low (0.0&ndash;3.9).</p>' +
      '<p>Critical and High severity CVEs should be addressed promptly, especially if the affected package has many reverse dependencies.</p>',
    learnMore: '/help#cvss',
  },

  'cve-detail-status': {
    title: 'CVE Status',
    description:
      '<p>The current management status of this CVE: <strong>Open</strong> (needs attention), <strong>Dismissed</strong> (reviewed and accepted or not applicable), or <strong>Fixed</strong> (resolved by updating the package).</p>' +
      '<p>Status can be changed using the action buttons. CVEs are auto-fixed when a manifest push shows the affected package at or above the fix version.</p>',
    learnMore: '/help#cve-management',
  },

  'cve-status-dismissed-badge': {
    title: 'Dismissed',
    description:
      '<p>This CVE has been <strong>dismissed</strong>  -  it was reviewed and determined to not apply to your configuration, or the risk has been accepted.</p>' +
      '<p>Dismissed CVEs can be <strong>reopened</strong> at any time if new information changes the assessment.</p>',
    learnMore: '/help#cve-management',
  },

  'cve-status-fixed-badge': {
    title: 'Fixed',
    description:
      '<p>This CVE has been <strong>fixed</strong>  -  the affected package was updated to a version at or above the known fix version.</p>' +
      '<p>CVEs are typically auto-fixed when a manifest push shows the package has been updated past the fix version. They can also be manually marked as fixed.</p>',
    learnMore: '/help#cve-management',
  },

  'cve-status-open-badge': {
    title: 'Open',
    description:
      '<p>This CVE is <strong>open</strong> and still linked to an installed package. The CVE list tabs show whether a fix is available, no fix is known yet, or the match still needs triage.</p>' +
      '<p>If a fixed version exists, update/rebuild the package. If no fix exists, monitor upstream, apply mitigations, or dismiss with a documented reason if it does not apply.</p>',
    learnMore: '/help#cve-management',
  },

  // --- Graph page (additional) --------------------------------------

  'graph-legend-direct-dep': {
    title: 'Direct Dependency',
    description:
      '<p>A <strong>green node</strong> representing a package that the selected package <strong>directly depends on</strong>. These are first-level runtime dependencies.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend-direct-revdep': {
    title: 'Direct Reverse Dependency',
    description:
      '<p>An <strong>orange node</strong> representing a package that <strong>directly depends on</strong> the selected package. Updating the selected package may require rebuilding these dependents.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend-indirect-dep': {
    title: 'Indirect Dependency',
    description:
      '<p>A <strong>teal node</strong> representing a dependency of a dependency  -  a package two or more levels deep in the dependency chain. Visible at graph depth 2 or higher.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend-indirect-revdep': {
    title: 'Indirect Reverse Dependency',
    description:
      '<p>A node representing a package that <strong>indirectly depends on</strong> the selected package through one or more intermediate packages. Visible at graph depth 2 or higher.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend-outdated': {
    title: 'Outdated Node',
    description:
      '<p>Nodes with an <strong>orange border</strong> indicate packages that have a newer upstream version available. Enable the "Highlight Outdated" toggle to show these borders.</p>' +
      '<p>This helps visualize how outdated packages are distributed across the dependency tree.</p>',
    learnMore: '/help#graph',
  },

  'graph-legend-selected': {
    title: 'Selected Node',
    description:
      '<p>The <strong>blue node</strong> at the center of the graph is the currently selected package. All other nodes are shown relative to this package  -  dependencies below and reverse dependencies above.</p>',
    learnMore: '/help#graph',
  },

  'graph-stats': {
    title: 'Graph Statistics',
    description:
      '<p>Summary statistics for the selected package\'s dependency graph:</p>' +
      '<ul>' +
      '<li><strong>Dependencies</strong>  -  Total number of packages this package depends on (direct and indirect)</li>' +
      '<li><strong>Reverse dependencies</strong>  -  Total number of packages that depend on this one</li>' +
      '<li><strong>Nodes shown</strong>  -  How many nodes are currently visible at the selected depth</li>' +
      '</ul>',
    learnMore: '/help#graph',
  },

  'graph-suggestions': {
    title: 'Suggested Packages',
    description:
      '<p>Quick-access links to commonly interesting packages for graph exploration. Includes packages with the <strong>most reverse dependencies</strong> (high-impact packages) and packages with the <strong>deepest dependency chains</strong>.</p>',
    learnMore: '/help#graph',
  },

  // --- KB page (additional) -----------------------------------------

  'kb-article-card': {
    title: 'Article Card',
    description:
      '<p>A summary card for a knowledge base article, showing the <strong>title</strong>, <strong>tags</strong>, <strong>linked packages</strong>, and <strong>last updated date</strong>. Click the card to open the full article.</p>',
    learnMore: '/help#knowledge-base',
  },

  'kb-article-package-badge': {
    title: 'Linked Package Badge',
    description:
      '<p>A clickable badge showing a <strong>package linked to this article</strong>. Click to navigate to that package\'s detail page.</p>',
  },

  'kb-article-title': {
    title: 'Article Title',
    description:
      '<p>The <strong>title</strong> of the knowledge base article. Click to open the full article view with rendered Markdown content.</p>',
  },

  'kb-article-updated': {
    title: 'Last Updated',
    description:
      '<p>When this article was <strong>last modified</strong>. Articles should be kept up to date as package versions and workarounds change.</p>',
  },

  'kb-body': {
    title: 'Article Body',
    description:
      '<p>The full content of the knowledge base article, rendered from <strong>Markdown</strong>. Supports headings, code blocks, lists, links, and other standard Markdown formatting.</p>',
    learnMore: '/help#knowledge-base',
  },

  'kb-created': {
    title: 'Created Date',
    description:
      '<p>When this knowledge base article was <strong>originally created</strong>.</p>',
  },

  'kb-delete': {
    title: 'Delete Article',
    description:
      '<p>Permanently <strong>delete this knowledge base article</strong>. This action cannot be undone. A confirmation dialog will appear before deletion.</p>',
  },

  'kb-delete-advisories-checkbox': {
    title: 'Delete Linked Advisories',
    description:
      '<p>When checked, any <strong>advisories linked to this article</strong> will also be deleted along with the article. Uncheck to keep the advisories and only delete the KB article itself.</p>',
  },

  'kb-delete-cancel': {
    title: 'Cancel Deletion',
    description:
      '<p>Close the delete confirmation dialog <strong>without deleting</strong> the article. No changes are made.</p>',
  },

  'kb-delete-confirm': {
    title: 'Confirm Deletion',
    description:
      '<p>Confirm and <strong>permanently delete</strong> the article. If the "delete linked advisories" checkbox is checked, associated advisories are also removed.</p>',
  },

  'kb-delete-modal': {
    title: 'Delete Confirmation',
    description:
      '<p>A confirmation dialog that appears before deleting a KB article. Review the article title and decide whether to also delete linked advisories before confirming.</p>',
  },

  'kb-edit': {
    title: 'Edit Article',
    description:
      '<p>Open the <strong>edit form</strong> for this knowledge base article, allowing you to modify the title, slug, body, tags, linked packages, and advisory settings.</p>',
  },

  'kb-form-advisory-severity-label': {
    title: 'Advisory Severity Label',
    description:
      '<p>Label for the severity selector when creating an advisory alongside a KB article. The severity determines how prominently the advisory is displayed.</p>',
  },

  'kb-form-advisory-severity-select': {
    title: 'Advisory Severity',
    description:
      '<p>Choose the <strong>severity level</strong> for the advisory created with this article:</p>' +
      '<ul>' +
      '<li><strong>Critical</strong>  -  Security risk or breaking issue</li>' +
      '<li><strong>Warning</strong>  -  Caution needed</li>' +
      '<li><strong>Info</strong>  -  Informational note</li>' +
      '</ul>',
    learnMore: '/help#advisories',
  },

  'kb-form-advisory-toggle': {
    title: 'Create Advisory Toggle',
    description:
      '<p>When enabled, a <strong>linked advisory</strong> is automatically created alongside this KB article. The advisory will reference the article and be attached to the same linked packages.</p>' +
      '<p>This is a shortcut for creating both a KB article and an advisory in one step.</p>',
    learnMore: '/help#advisories',
  },

  'kb-form-body-label': {
    title: 'Body Label',
    description:
      '<p>Label for the article body text area. The body is written in <strong>Markdown</strong> format.</p>',
  },

  'kb-form-body-textarea': {
    title: 'Article Body',
    description:
      '<p>The main content of the article in <strong>Markdown format</strong>. Supports headings (<code>##</code>), code blocks (<code>```</code>), lists, links, bold, italic, and other standard Markdown syntax.</p>' +
      '<p>Use code blocks for build commands, patches, and configuration snippets.</p>',
  },

  'kb-form-cancel': {
    title: 'Cancel',
    description:
      '<p><strong>Discard changes</strong> and return to the previous page without saving. Any unsaved edits will be lost.</p>',
  },

  'kb-form-create-advisory': {
    title: 'Create Advisory',
    description:
      '<p>Submit the form and <strong>create a linked advisory</strong> in addition to the KB article. The advisory inherits the selected severity and linked packages from the form.</p>',
    learnMore: '/help#advisories',
  },

  'kb-form-packages-hint': {
    title: 'Packages Hint',
    description:
      '<p>A hint explaining that linked packages create <strong>cross-references</strong> between the KB article and the package detail pages. This makes it easy to find relevant articles from a package\'s page.</p>',
  },

  'kb-form-packages-label': {
    title: 'Linked Packages Label',
    description:
      '<p>Label for the package selector. Select packages that this article is relevant to.</p>',
  },

  'kb-form-packages-select': {
    title: 'Linked Packages',
    description:
      '<p>Select one or more <strong>packages to link</strong> to this article. Linked packages will show a reference to this article on their detail pages.</p>' +
      '<p>Start typing a package name to filter the list. You can link multiple packages.</p>',
  },

  'kb-form-slug-hint': {
    title: 'Slug Hint',
    description:
      '<p>The slug is used in the article\'s URL. Use lowercase letters, numbers, and hyphens only (e.g., <code>mesa-build-fix-2024</code>).</p>',
  },

  'kb-form-slug-input': {
    title: 'Article Slug',
    description:
      '<p>A <strong>URL-friendly identifier</strong> for the article, used in the article\'s web address. Must be unique across all KB articles.</p>' +
      '<p>Example: <code>gcc-14-toolchain-rebuild</code> produces the URL <code>/kb/gcc-14-toolchain-rebuild</code>.</p>',
  },

  'kb-form-slug-label': {
    title: 'Slug Label',
    description:
      '<p>Label for the slug input field. The slug is the URL-friendly identifier for this article.</p>',
  },

  'kb-form-submit': {
    title: 'Save Article',
    description:
      '<p><strong>Save</strong> the knowledge base article. Creates a new article or updates an existing one with the current form values.</p>',
  },

  'kb-form-tags-input': {
    title: 'Tags Input',
    description:
      '<p>Enter <strong>comma-separated tags</strong> to categorize the article (e.g., <code>security, build-fix, kde</code>). Tags are used for filtering on the KB listing page.</p>',
  },

  'kb-form-tags-label': {
    title: 'Tags Label',
    description:
      '<p>Label for the tags input field. Tags help categorize and filter KB articles.</p>',
  },

  'kb-form-title-input': {
    title: 'Article Title',
    description:
      '<p>A descriptive <strong>title</strong> for the knowledge base article. Keep it concise but informative  -  it appears in the article list and search results.</p>',
  },

  'kb-form-title-label': {
    title: 'Title Label',
    description:
      '<p>Label for the article title input field.</p>',
  },

  'kb-linked-advisories': {
    title: 'Linked Advisories',
    description:
      '<p><strong>Advisories linked to this article.</strong> These are manually created alerts attached to the same packages as this KB article, providing severity-rated warnings that appear on package detail pages.</p>',
    learnMore: '/help#advisories',
  },

  'kb-linked-advisory-item': {
    title: 'Linked Advisory',
    description:
      '<p>A single advisory linked to this KB article, showing its <strong>severity badge</strong> and <strong>title</strong>. Click to view the advisory details.</p>',
  },

  'kb-linked-package-item': {
    title: 'Linked Package',
    description:
      '<p>A package linked to this KB article. Click to navigate to the <strong>package detail page</strong>, where this article will also appear as a reference.</p>',
  },

  'kb-slug': {
    title: 'Article Slug',
    description:
      '<p>The <strong>URL-friendly identifier</strong> for this article, shown in the browser address bar. For example, a slug of <code>mesa-build-fix</code> produces the URL <code>/kb/mesa-build-fix</code>.</p>',
  },

  'kb-tag-badge': {
    title: 'Tag Badge',
    description:
      '<p>A tag assigned to this article, displayed as a <strong>clickable badge</strong>. Click to filter the KB listing to show only articles with this tag.</p>',
  },

  'kb-tags': {
    title: 'Article Tags',
    description:
      '<p>The <strong>tags</strong> assigned to this knowledge base article. Tags categorize articles for easy filtering  -  common tags include <code>security</code>, <code>build-fix</code>, <code>workaround</code>, and <code>kde</code>.</p>',
  },

  'kb-updated': {
    title: 'Last Updated',
    description:
      '<p>The date this article was <strong>last modified</strong>. Check this date to gauge whether the information is still current.</p>',
  },

  // --- Security page (additional entries) ----------------------------

  // --- Settings page (additional entries) ----------------------------

  'settings-alert-email': {
    title: 'Alert Email Address',
    description:
      '<p>The email address where all alert notifications are sent. If left blank, defaults to the <code>ALERT_EMAIL</code> value from the server\'s <code>.env</code> file.</p>',
    learnMore: '/help#notifications',
  },

  'settings-api-key-display': {
    title: 'API Key ID',
    description:
      '<p>The <strong>key identifier</strong> used in the <code>X-Api-Key-Id</code> header when the monitored system pushes manifests. This is the public half  -  the secret used for HMAC-SHA256 signing is stored only in the <code>.env</code> file.</p>',
    learnMore: '/help#api-auth',
  },







  'settings-resolve-cves': {
    title: 'Resolve CVEs',
    description:
      '<p>Trigger the <strong>CVE resolver worker</strong> to sweep all open CVE-&gt;package links. For each link, if the installed package version meets or exceeds the fix version (<code>affectedEndExcluding</code>, <code>affectedEndIncluding</code>, or <code>fixedVersion</code>), the link is removed.</p>' +
      '<p>Open CVEs with zero remaining package links are automatically transitioned to <strong>fixed</strong> status. This normally runs every 2 hours  -  use this button to trigger it immediately after a package update.</p>',
    learnMore: '/help#cves',
  },

  'settings-cvss-threshold': {
    title: 'CVSS Threshold',
    description:
      '<p>The minimum <strong>CVSS score</strong> a CVE must have to trigger an email alert. Options:</p>' +
      '<ul>' +
      '<li><strong>4.0</strong>  -  Alert on Medium and above</li>' +
      '<li><strong>7.0</strong>  -  Alert on High and above (default)</li>' +
      '<li><strong>9.0</strong>  -  Alert on Critical only</li>' +
      '</ul>',
    learnMore: '/help#notifications',
  },

  'settings-dedup-trigger-col': {
    title: 'Trigger Column',
    description:
      '<p>What <strong>causes</strong> this notification type to be sent  -  for example, a new CVE detection, a cron schedule, or a threshold being exceeded.</p>',
  },

  'settings-dedup-type-col': {
    title: 'Type Column',
    description:
      '<p>The <strong>notification type</strong> (CVE Alert, Weekly Digest, Staleness Alert, etc.). Each type has its own deduplication window.</p>',
  },

  'settings-dedup-window-col': {
    title: 'Dedup Window Column',
    description:
      '<p>The <strong>minimum time</strong> that must pass before the same notification type is sent again. Prevents alert fatigue from repeated notifications about the same issue.</p>',
  },

  'settings-detect-upstream': {
    title: 'Detect Upstream',
    description:
      '<p>Run the <strong>upstream source auto-detection</strong> script, which attempts to find and configure upstream version sources for packages that don\'t have one yet. Uses heuristics to match package names to GitHub repos, GNU projects, PyPI packages, etc.</p>',
  },

  'settings-last-push': {
    title: 'Last Manifest Push',
    description:
      '<p>The timestamp of the <strong>most recent manifest push</strong> received from the monitored system. If this is stale, the dashboard may not reflect current system state.</p>',
    learnMore: '/help#manifest-push',
  },

  'settings-notification-dedup': {
    title: 'Notification Deduplication',
    description:
      '<p>A reference table showing the <strong>deduplication rules</strong> for each notification type. Deduplication prevents the same alert from being sent repeatedly within a time window.</p>' +
      '<p>For example, a CVE alert for a specific CVE is only sent once per 24 hours, and the weekly digest is sent at most once every 6 days.</p>',
    learnMore: '/help#notifications',
  },

  'settings-notif-recipient-col': {
    title: 'Recipient Column',
    description:
      '<p>The <strong>email address</strong> the notification was sent to.</p>',
  },

  'settings-notif-sent-col': {
    title: 'Sent Column',
    description:
      '<p>The <strong>timestamp</strong> when this notification was sent.</p>',
  },

  'settings-notif-subject-col': {
    title: 'Subject Column',
    description:
      '<p>The <strong>email subject line</strong> of the notification, with the <code>[Vigil]</code> prefix removed for readability.</p>',
  },

  'settings-notif-type-col': {
    title: 'Type Column (Notifications)',
    description:
      '<p>The <strong>notification category</strong> (e.g., cve_alert, weekly_digest, watched_release, staleness_alert). Helps identify which alert rule triggered the notification.</p>',
  },

  'settings-open-cves': {
    title: 'Open CVEs (Settings)',
    description:
      '<p>The total number of <strong>unresolved CVEs</strong> currently matched to installed packages. A quick reference to gauge overall security exposure.</p>',
    learnMore: '/help#cves',
  },


  'settings-theme': {
    title: 'Theme',
    description:
      '<p>Choose a <strong>visual theme</strong> for the dashboard. There are 76 themes across 8 categories: Default, Dark, Terminal, Nature, Retro, Neon, Pastel, and Monochrome.</p>' +
      '<p>Click any swatch to apply the theme instantly. Your selection is saved server-side so it persists across devices and sessions.</p>' +
      '<p>The theme only changes the dashboard appearance  -  it does not affect data, workers, or any monitoring behaviour.</p>',
  },

  'settings-recent-notifications': {
    title: 'Recent Notifications',
    description:
      '<p>A log of the <strong>most recently sent email notifications</strong>, showing when each was sent, its type, subject, and recipient. Useful for verifying that alerts are being delivered correctly.</p>',
    learnMore: '/help#notifications',
  },

  'settings-save-alerts': {
    title: 'Save Alert Settings',
    description:
      '<p>Persist all changes to the <strong>email alert configuration</strong>  -  recipient address, enabled alert types and CVSS thresholds.</p>',
  },

  'settings-save-multipliers': {
    title: 'Save Multipliers',
    description:
      '<p>Save the updated <strong>staleness score multipliers</strong>. The staleness scorer worker will use these multipliers on its next run to adjust scores by package group.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'settings-send-test-email': {
    title: 'Send Test Email',
    description:
      '<p>Send a <strong>test email</strong> to the configured alert address to verify that SMTP is working correctly. The test email confirms the server can reach the mail relay and deliver messages.</p>',
    learnMore: '/help#notifications',
  },

  'settings-source-count-col': {
    title: 'Count Column',
    description:
      '<p>The number of <strong>upstream sources</strong> configured for this source type. For example, if 45 packages use GitHub as their upstream source, this column shows 45.</p>',
  },

  'settings-source-last-checked-col': {
    title: 'Last Checked Column',
    description:
      '<p>When the worker for this source type <strong>last completed a check</strong> across all sources of that type.</p>',
  },

  'settings-source-type-col': {
    title: 'Source Type Column',
    description:
      '<p>The <strong>upstream source type</strong>  -  GitHub, GitLab, GNU, PyPI, Kernel, KDE, Generic, or Flathub.</p>',
  },

  'settings-staleness-mult-input': {
    title: 'Multiplier Input',
    description:
      '<p>A <strong>weight factor</strong> applied to staleness scores for packages in this group. Values above 1.0 increase scores (making them more urgent); values below 1.0 decrease them. For example, setting toolchain to 1.5 makes toolchain packages score 50% higher.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'settings-staleness-multipliers': {
    title: 'Staleness Score Multipliers',
    description:
      '<p>Adjust staleness score weight <strong>by package group</strong>. Multipliers let you prioritize certain groups over others  -  for example, making toolchain or security-critical packages score higher so they appear more urgent on the Updates page.</p>',
    learnMore: '/help#staleness-scoring',
  },

  'settings-staleness-threshold': {
    title: 'Staleness Alert Threshold',
    description:
      '<p>The minimum <strong>staleness score</strong> a package must have to be included in staleness alert emails:</p>' +
      '<ul>' +
      '<li><strong>10</strong>  -  Include Medium and above</li>' +
      '<li><strong>20</strong>  -  Include High and above (default)</li>' +
      '<li><strong>25</strong>  -  Include Critical only</li>' +
      '</ul>',
    learnMore: '/help#staleness-scoring',
  },

  'settings-toggle-cve-alerts': {
    title: 'CVE Alerts Toggle',
    description:
      '<p>Enable or disable <strong>immediate CVE email alerts</strong>. When enabled, you receive an email as soon as a new CVE matching your packages is detected with a CVSS score at or above the configured threshold.</p>',
    learnMore: '/help#notifications',
  },

  'settings-toggle-digest-alerts': {
    title: 'Weekly Digest Toggle',
    description:
      '<p>Enable or disable the <strong>weekly digest email</strong>. The digest summarizes new CVEs, open CVE count, top outdated packages, and system health  -  sent every Sunday by the digest-mailer worker.</p>',
    learnMore: '/help#notifications',
  },

  'settings-toggle-staleness-alerts': {
    title: 'Staleness Alerts Toggle',
    description:
      '<p>Enable or disable <strong>staleness alert emails</strong>. When enabled, a weekly email lists all packages above the configured staleness score threshold, sent alongside the digest.</p>',
    learnMore: '/help#notifications',
  },

  'settings-toggle-unmapped-alerts': {
    title: 'Unmonitored Package Alerts Toggle',
    description:
      '<p>Enable or disable <strong>unmonitored package alerts</strong>. When enabled, a one-time email is sent when a newly installed package has no upstream source configured after auto-detection runs. Each package is only alerted once.</p>',
    learnMore: '/help#notifications',
  },


  'settings-toggle-watched-alerts': {
    title: 'Watched Package Alerts Toggle',
    description:
      '<p>Enable or disable <strong>watched package email alerts</strong>. When enabled, you receive an email within an hour when a new upstream version is detected for any package you\'ve marked as watched.</p>',
    learnMore: '/help#notifications',
  },







  'settings-total-packages': {
    title: 'Total Packages (Settings)',
    description:
      '<p>The total number of packages currently tracked. Same as the Overview total  -  shown here for quick reference in the settings context.</p>',
  },

  'settings-unmatched-cve-products': {
    title: 'Unmatched CVE Products',
    description:
      '<p>CPE product names from CVE feeds that <strong>could not be automatically mapped</strong> to any installed package. Mapping these improves CVE matching accuracy  -  a CVE might affect a package on your system but go undetected because the product name differs from the package name.</p>',
    learnMore: '/help#cve-matching',
  },

  'settings-unmatched-cves-col': {
    title: 'CVEs Column (Unmatched)',
    description:
      '<p>The number of <strong>CVEs referencing this product name</strong>. Higher counts mean more potential vulnerabilities that may affect your system if the product maps to an installed package.</p>',
  },

  'settings-unmatched-lastseen-col': {
    title: 'Last Seen Column',
    description:
      '<p>When this unmatched product name was <strong>last encountered</strong> in a CVE feed scan. Recent dates indicate the product is still actively receiving vulnerability reports.</p>',
  },

  'settings-unmatched-map-btn': {
    title: 'Map Button',
    description:
      '<p>Submit the mapping to <strong>link this CVE product name</strong> to the specified package. Once mapped, all CVEs referencing this product will be matched to the package.</p>',
  },

  'settings-unmatched-map-col': {
    title: 'Map to Package Column',
    description:
      '<p>A text input and button to <strong>create a CVE alias</strong>  -  mapping this unmatched product name to an installed package so future CVEs are correctly matched.</p>',
  },

  'settings-unmatched-map-input': {
    title: 'Package Name Input (Map)',
    description:
      '<p>Enter the <strong>installed package name</strong> that this CVE product corresponds to. Uses autocomplete from your package list. For example, map the CVE product "linux_kernel" to your package "linux".</p>',
  },

  'settings-unmatched-product-col': {
    title: 'Product Column',
    description:
      '<p>The <strong>CPE product name</strong> from the CVE feed that couldn\'t be matched to any installed package. This is the name used in the National Vulnerability Database\'s Common Platform Enumeration.</p>',
  },

  'settings-unmatched-vendor-col': {
    title: 'Vendor Column',
    description:
      '<p>The <strong>CPE vendor name</strong> associated with this product in the CVE feed (e.g., "gnu", "linux", "mozilla"). Helps identify which upstream project the product belongs to.</p>',
  },

  'settings-upstream-sources': {
    title: 'Upstream Sources (Settings)',
    description:
      '<p>The total number of <strong>configured upstream sources</strong> for version monitoring. Compare this to the total package count to gauge coverage  -  ideally every package has a source configured.</p>',
    learnMore: '/help#upstream-sources',
  },

  'settings-upstream-sources-by-type': {
    title: 'Upstream Sources by Type',
    description:
      '<p>A breakdown of configured upstream sources <strong>grouped by source type</strong> (GitHub, GitLab, GNU, PyPI, etc.), showing how many packages use each type and when it was last checked.</p>',
    learnMore: '/help#upstream-sources',
  },

  'settings-worker-active-badge': {
    title: 'Active Badge',
    description:
      '<p>Indicates the worker is <strong>enabled and running</strong> on its configured schedule. Active workers check for updates, scan for CVEs, or recompute staleness automatically.</p>',
  },

  'settings-worker-desc-col': {
    title: 'Description Column',
    description:
      '<p>A brief summary of what this <strong>worker does</strong>  -  for example, "Check GitHub repos for new releases" or "Fetch new/updated CVEs from NIST NVD".</p>',
  },

  'settings-worker-disabled-badge': {
    title: 'Disabled Badge',
    description:
      '<p>Indicates the worker is <strong>currently disabled</strong> and will not run on its schedule. Disabled workers can be re-enabled in the worker configuration.</p>',
  },

  'settings-worker-name-col': {
    title: 'Worker Name Column',
    description:
      '<p>The <strong>internal name</strong> of the background worker (e.g., <code>github-release</code>, <code>nvd-cve</code>, <code>staleness-scorer</code>). This matches the worker registry key used in logs and configuration.</p>',
  },

  'settings-worker-run-btn': {
    title: 'Run Button',
    description:
      '<p>Trigger this worker to <strong>run immediately</strong>. The worker executes asynchronously and results appear on the relevant page once processing completes. Useful for getting fresh data after configuration changes.</p>',
    learnMore: '/help#workers',
  },

  'settings-worker-run-col': {
    title: 'Run Now Column',
    description:
      '<p>Contains a <strong>Run button</strong> to manually trigger the worker, and shows the result status after execution (queued, success, or error).</p>',
  },

  'settings-worker-schedule-col': {
    title: 'Schedule Column',
    description:
      '<p>The <strong>cron expression</strong> defining how often this worker runs automatically (e.g., <code>0 */2 * * *</code> for every 2 hours).</p>',
    learnMore: '/help#workers',
  },

  'settings-worker-status-col': {
    title: 'Status Column',
    description:
      '<p>Shows whether the worker is <strong>active</strong> (enabled and running on schedule) or <strong>disabled</strong> (not running).</p>',
  },

  // --- Updates page (additional entries) -----------------------------

  'updates-adjust-defer-btn': {
    title: 'Adjust Deferral',
    description:
      '<p>Open the defer modal to <strong>change the deferral duration</strong> for this package. You can extend or shorten the deferral period and update the reason.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-bulk-action-select': {
    title: 'Bulk Action Select',
    description:
      '<p>Choose the <strong>bulk action</strong> to apply to all selected packages: <strong>Pin</strong> (permanently exclude) or <strong>Defer</strong> (temporarily hide for a set number of days).</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-bulk-apply': {
    title: 'Apply Bulk Action',
    description:
      '<p>Execute the selected bulk action (<strong>Pin</strong> or <strong>Defer</strong>) on all checked packages with the provided reason. The page reloads after the action completes.</p>',
  },

  'updates-bulk-reason': {
    title: 'Bulk Reason',
    description:
      '<p>An optional <strong>shared reason</strong> applied to all selected packages when performing a bulk pin or defer action. For example, "Waiting for KDE 6.2 full release" or "Holding back for toolchain rebuild".</p>',
  },

  'updates-col-defer-reason': {
    title: 'Defer Reason Column',
    description:
      '<p>The <strong>reason</strong> provided when this package was deferred. Helps you remember why the update was postponed when reviewing deferred packages later.</p>',
  },

  'updates-col-deferred-expires': {
    title: 'Deferred / Expires Column',
    description:
      '<p>Shows <strong>when the package was deferred</strong> and <strong>when the deferral expires</strong>. Also displays the number of days remaining. If the deferral has expired, it shows "Expired"  -  the package will reappear in the outdated list on the next staleness scorer run.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-col-pinned-since': {
    title: 'Pinned Since Column',
    description:
      '<p>The <strong>date this package was pinned</strong>. Helps you track how long a package has been excluded from updates  -  long-pinned packages may warrant re-evaluation.</p>',
  },

  'updates-col-pin-reason': {
    title: 'Pin Reason Column',
    description:
      '<p>The <strong>reason</strong> provided when this package was pinned. Helps you remember why the package is being held at its current version.</p>',
  },

  'updates-defer-custom-days': {
    title: 'Custom Days Input',
    description:
      '<p>Enter a <strong>custom number of days</strong> for the deferral period. Use this when the preset options (7, 30, 90 days) don\'t fit your needs. Maximum is 3650 days (10 years).</p>',
  },

  'updates-defer-duration-label': {
    title: 'Defer Duration Label',
    description:
      '<p>Choose how long to <strong>defer this package</strong>. The package will be hidden from the outdated list for the selected period, then reappear automatically (or immediately if a CVE is found).</p>',
  },

  'updates-defer-duration-select': {
    title: 'Defer Duration Select',
    description:
      '<p>Preset deferral periods: <strong>1 week</strong> (7 days), <strong>1 month</strong> (30 days), <strong>3 months</strong> (90 days), or <strong>Custom</strong> to enter a specific number of days.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-defer-reason': {
    title: 'Defer Reason',
    description:
      '<p>An optional <strong>explanation</strong> for why this package is being deferred. Visible on the deferred packages list so you can remember the rationale later. For example, "Waiting for patch release" or "Batch with KDE update".</p>',
  },

  'updates-undefer-btn': {
    title: 'Undefer Button',
    description:
      '<p><strong>Cancel the deferral</strong> for this package, returning it to the active outdated list immediately. Use this when you\'re ready to address the update sooner than originally planned.</p>',
    learnMore: '/help#pin-defer',
  },

  'updates-unpin-btn': {
    title: 'Unpin Button',
    description:
      '<p><strong>Remove the pin</strong> from this package, returning it to the active outdated list. Use this when the reason for pinning no longer applies and you want to track the package for updates again.</p>',
    learnMore: '/help#pin-defer',
  },


};
