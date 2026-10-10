/**
 * Determine if a version string should be excluded from "latest stable" tracking.
 *
 * Filters out:
 * - Pre-release tags: rc, alpha, beta, dev, devel, pre, snapshot, nightly, canary, next
 * - Python/Ruby-style suffixes: 3.15.0a1, 1.0.0b2, 2.0.0c1
 * - VCS snapshots: git, svn, hg revisions
 * - Date-based versions (e.g., "20260225-204041")
 * - Non-version strings (commit hashes, branch names, Xorg mega-release tags, etc.)
 * - GNOME-style unstable branches (odd minor version for known GNOME packages)
 * - GNOME cycle-versioned unstable releases (odd major: 49.x = dev, 48.x = stable)
 */

// Pre-release keywords, allowing trailing dot-separated numbers (e.g., "beta.2", "rc1")
const PRE_RELEASE_RE = /[-._]?(alpha|beta|rc|dev|devel|pre|snapshot|nightly|canary|next|unstable|test|preview|experimental|start|trunk|tip|head)[\d.]*/i;
// Python/Ruby-style: 3.15.0a1, 1.0.0b2, 2.0.0rc1 (letter directly follows digit)
const PEP440_PRE_RE = /\d(a|b|rc|dev)\d/i;
// Single-letter pre-release suffix with separator: -a1, .b2, _c3
const PRE_RELEASE_SUFFIX_RE = /[-._](a|b|c)\d+$/i;
// VCS snapshot patterns
const VCS_SNAPSHOT_RE = /[-._](git|svn|hg|r\d{5,})/i;
// Date-based snapshot versions with a time component (e.g., "20260225-204041")
// but NOT plain date-based versions like "20260107.1" (abseil-cpp) or "20250807" (iana-etc)
const DATE_VERSION_RE = /^20\d{6}[-_]\d{4,}/;
// Git commit hashes (7-40 hex chars, must contain at least one letter to
// distinguish from pure-numeric date versions like "20190702" or "20260306")
const NON_VERSION_RE = /^[a-f0-9]{7,40}$/i;
const HAS_HEX_LETTER_RE = /[a-f]/i;
// Non-version strings (branch names, tags that aren't real versions)
const NON_VERSION_WORDS_RE = /^(master|main|HEAD|trunk|latest|stable|release|old)[-._]/i;
// Xorg mega-release tags
const XORG_MEGA_RE = /^XORG[-_]/i;
// RFC draft tags
const RFC_TAG_RE = /^(webp-)?rfc/i;
// Version strings that contain non-version segments
const JUNK_VERSION_RE = /[-._](old|bak|orig|copy|save|tmp|wip|broken|test|debug|start|devel)$/i;

export function isPreRelease(version: string): boolean {
  return (
    PRE_RELEASE_RE.test(version) ||
    PEP440_PRE_RE.test(version) ||
    PRE_RELEASE_SUFFIX_RE.test(version) ||
    VCS_SNAPSHOT_RE.test(version) ||
    DATE_VERSION_RE.test(version) ||
    (NON_VERSION_RE.test(version) && HAS_HEX_LETTER_RE.test(version)) ||
    NON_VERSION_WORDS_RE.test(version) ||
    XORG_MEGA_RE.test(version) ||
    RFC_TAG_RE.test(version) ||
    JUNK_VERSION_RE.test(version)
  );
}

export function matchesTagPattern(version: string, tagPattern: unknown): boolean {
  if (typeof tagPattern !== 'string' || tagPattern.length === 0) return true;

  try {
    return new RegExp(tagPattern).test(version);
  } catch {
    return true;
  }
}

/**
 * Check if an upstream version is on a different major branch from the installed version,
 * which would indicate a major version upgrade that may not be a safe drop-in update.
 *
 * Returns true if the upstream version is on a DIFFERENT major branch.
 * This is advisory - workers can use this to flag but still record the release.
 */
export function isDifferentMajorBranch(upstream: string, installed: string): boolean {
  const uParts = upstream.split('.');
  const iParts = installed.replace(/-\d+$/, '').split('.');

  if (uParts.length < 2 || iParts.length < 2) return false;

  const uMajor = parseInt(uParts[0], 10);
  const iMajor = parseInt(iParts[0], 10);

  if (isNaN(uMajor) || isNaN(iMajor)) return false;

  // Different major version = different branch
  return uMajor !== iMajor;
}

/**
 * GNOME-style projects use odd minor versions for development releases.
 * E.g., glib 2.85.x is development, 2.84.x is stable.
 * Also applies to: at-spi2-core, pango, gtk, gdk-pixbuf, json-glib,
 * gsettings-desktop-schemas, libsoup, etc.
 *
 * GStreamer uses odd minor for development (1.27 = dev, 1.26 = stable).
 * PipeWire/WirePlumber use odd minor for development (1.5 = dev, 1.4 = stable).
 * libinput uses .90x micro versions for development.
 */

// Projects that use GNOME-style odd-minor versioning (major.minor.micro)
const GNOME_UNSTABLE_PROJECTS = new Set([
  'glib', 'glib2', 'gdk-pixbuf', 'gdk-pixbuf2', 'gtk3', 'gtk4',
  'pango', 'at-spi2-core', 'atk', 'json-glib', 'libsoup', 'libsoup3',
  'gnome-desktop', 'geocode-glib',
  'gvfs', 'libgweather', 'evolution-data-server', 'folks',
  'gobject-introspection', 'vala', 'pygobject', 'python-gobject',
  'gstreamer', 'gst-plugins-base', 'gst-plugins-good', 'gst-plugins-bad',
  'gst-plugins-ugly', 'gst-libav', 'poppler',
  'librsvg', 'pipewire', 'wireplumber',
  'libinput', 'upower', 'flatpak',
]);

// Projects that use .90+ micro versions as pre-releases but do NOT use odd-minor versioning.
// E.g., wayland 1.24.90/1.24.91 are pre-releases for 1.25.0.
const MICRO_90_PRERELEASE_PROJECTS = new Set([
  'wayland', 'wayland-protocols',
  'xkeyboard-config', 'xorgproto',
  'libxkbcommon',
]);

// GNOME cycle-versioned projects: odd MAJOR = development (49.x = dev, 48.x = stable)
// These moved from 2.x.y to cycle versioning (40, 41, 42, ...) starting ~GNOME 40
const GNOME_CYCLE_PROJECTS = new Set([
  'gsettings-desktop-schemas',
]);

const PERL_STYLE_UNSTABLE = new Set(['perl']);
const PYTHON_STYLE_UNSTABLE = new Set(['python']);

export function isUnstableBranch(packageName: string, version: string, installedVersion: string): boolean {
  const parts = version.split('.');
  if (parts.length < 2) return false;

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);

  // GNOME cycle-versioned: odd major = development
  if (GNOME_CYCLE_PROJECTS.has(packageName)) {
    if (!isNaN(major) && major % 2 === 1 && major >= 40) return true;
  }

  if (isNaN(minor)) return false;

  // GNOME-style: odd minor = development
  if (GNOME_UNSTABLE_PROJECTS.has(packageName)) {
    if (minor % 2 === 1) return true;
    // Also catch .90+ micro versions (GNOME beta/RC)
    if (parts.length >= 3) {
      const micro = parseInt(parts[2], 10);
      if (!isNaN(micro) && micro >= 90) return true;
    }
  }

  // .90+ micro pre-releases (non-GNOME projects that use this convention)
  if (MICRO_90_PRERELEASE_PROJECTS.has(packageName) && parts.length >= 3) {
    const micro = parseInt(parts[2], 10);
    if (!isNaN(micro) && micro >= 90) return true;
  }

  // Perl: odd minor = development (5.43 = dev, 5.42 = stable)
  if (PERL_STYLE_UNSTABLE.has(packageName) && minor % 2 === 1) {
    return true;
  }

  // Python: only track same minor branch (3.13.x when installed is 3.13.y)
  if (PYTHON_STYLE_UNSTABLE.has(packageName)) {
    const iParts = installedVersion.replace(/-\d+$/, '').split('.');
    if (iParts.length >= 2 && parts.length >= 2) {
      if (parts[0] !== iParts[0] || parts[1] !== iParts[1]) {
        return true;
      }
    }
  }

  return false;
}
