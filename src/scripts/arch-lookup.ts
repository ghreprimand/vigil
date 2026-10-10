/**
 * Arch Linux package API lookup.
 * Given a package name, queries the Arch repos and classifies the upstream URL.
 */
import { brand } from '../config.js';

export interface ArchLookupResult {
  package: string;
  source_type: string;
  config: Record<string, unknown>;
}

// Map locally-named packages to their canonical Arch package names.
const NAME_OVERRIDES: Record<string, string> = {
  'python3': 'python',
  'lib32-glibc': 'glibc',
  'lib32-gcc-libs': 'gcc',
  // A custom-named kernel package still resolves to the upstream "linux" source.
  ...(brand.kernelPackage !== 'linux' ? { [brand.kernelPackage]: 'linux' } : {}),
};

const ARCH_API = 'https://archlinux.org/packages/search/json/';

export async function lookupArch(packageName: string): Promise<ArchLookupResult | null> {
  const queryName = NAME_OVERRIDES[packageName] ?? packageName;

  const url = `${ARCH_API}?name=${encodeURIComponent(queryName)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': brand.userAgent },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const data = await response.json() as {
    results: Array<{ url: string | null; pkgname: string }>;
  };

  if (!data.results?.length) return null;

  const upstreamUrl = data.results[0].url;
  if (!upstreamUrl) return null;

  return classifyUrl(packageName, upstreamUrl);
}

export function classifyUrl(packageName: string, upstreamUrl: string): ArchLookupResult | null {
  try {
    const url = new URL(upstreamUrl);
    const hostname = url.hostname;
    const pathParts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);

    // GitHub
    if (hostname === 'github.com' && pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      return {
        package: packageName,
        source_type: 'github',
        config: { owner, repo, tag_prefix: 'v' },
      };
    }

    // GitLab instances
    if (
      hostname === 'gitlab.freedesktop.org' ||
      hostname === 'gitlab.gnome.org' ||
      hostname === 'gitlab.com'
    ) {
      if (pathParts.length >= 2) {
        const project = pathParts.slice(0, pathParts.length).join('/');
        return {
          package: packageName,
          source_type: 'gitlab',
          config: { instance: `https://${hostname}`, project },
        };
      }
    }

    // GNU
    if (
      hostname.endsWith('.gnu.org') ||
      hostname === 'ftp.gnu.org'
    ) {
      // Try to extract software name from URL
      const softwareMatch = url.pathname.match(/\/software\/([^/]+)/);
      if (softwareMatch) {
        return {
          package: packageName,
          source_type: 'gnu',
          config: { ftp_path: `/gnu/${softwareMatch[1]}/` },
        };
      }
    }

    // PyPI
    if (hostname === 'pypi.org' && pathParts[0] === 'project' && pathParts[1]) {
      return {
        package: packageName,
        source_type: 'pypi',
        config: { project: pathParts[1] },
      };
    }

    // KDE
    if (hostname === 'kde.org' || hostname === 'invent.kde.org') {
      // Can't determine component from URL alone - skip for manual mapping
      return null;
    }

    return null;
  } catch {
    return null;
  }
}
