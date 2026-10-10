import { compareVersions } from '../../services/version-compare.js';

/**
 * Parse version-like directory names from an Apache/Nginx HTML directory listing.
 * Matches href attributes containing version patterns like "6.23/" or "5.15.1/"
 */
export function parseDirectoryVersions(html: string): string[] {
  const matches: string[] = [];
  const re = /href="(\d+(?:\.\d+)+)\/?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return dedupeAndSort(matches);
}

/**
 * Parse version strings from tarball filenames in an HTML directory listing.
 * Matches patterns like `coreutils-9.4.tar.xz`, extracting the version part.
 * Deduplicates across compression formats (.xz, .gz, .bz2, .lz, .zst).
 */
export function parseTarballVersions(html: string, productPrefix: string): string[] {
  const escaped = escapeRegExp(productPrefix);
  const re = new RegExp(
    `${escaped}[_-](\\d+(?:\\.\\d+)*[a-z]?)\\.tar\\.(?:xz|gz|bz2|lz|zst)`,
    'g',
  );
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return dedupeAndSort(matches);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeAndSort(versions: string[]): string[] {
  const unique = [...new Set(versions)];
  return unique.sort((a, b) => compareVersions(b, a)); // descending
}
