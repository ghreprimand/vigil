# Wiring Vigil into an LFS/BLFS build

Vigil does not watch your filesystem or read a package database you do not have.
On a Linux From Scratch or Beyond Linux From Scratch system, you are the package
manager: you decide what gets built and at which version. So the integration is
simple. You keep a list of what you installed, and you push that list to Vigil.
This guide shows a low-effort way to do both.

## 1. Keep one list as your source of truth

Pick a file and treat it as the record of what is installed and at what version.
A plain `name version` list, one package per line, is enough:

```
# /var/lib/vigil/packages.txt
zlib 1.3.1
openssl 3.5.0
bash 5.2.32
```

Lines starting with `#` are ignored, so you can leave notes in the file. This is
the same format the `plaintext-push.sh` producer reads, so there is nothing to
convert later.

Create it once:

```sh
sudo install -d -m 0755 /var/lib/vigil
sudo touch /var/lib/vigil/packages.txt
```

If you already keep a build log with names and versions in it, you can skip this
file and generate the `name version` list from that log instead. The list is just
the interface; where it comes from is up to you.

## 2. Record each package as you build it

Add a small shell function to your build environment and call it at the end of
each package's recipe, right after `make install` succeeds. It appends the
package, or replaces the line if that package is already listed, so re-running a
recipe updates the version in place instead of duplicating it.

```sh
# Add to ~/.bashrc, your build profile, or a sourced helpers file.
VIGIL_PKGLIST="${VIGIL_PKGLIST:-/var/lib/vigil/packages.txt}"

vigil_record() {
  # usage: vigil_record <name> <version>
  local name="$1" version="$2"
  [ -n "$name" ] && [ -n "$version" ] || { echo "vigil_record: need name and version" >&2; return 1; }
  local tmp
  tmp="$(mktemp)"
  # Drop any existing line for this package, then append the current one.
  grep -v -E "^${name}[[:space:]]" "$VIGIL_PKGLIST" 2>/dev/null > "$tmp" || true
  printf '%s %s\n' "$name" "$version" >> "$tmp"
  sort -o "$tmp" "$tmp"
  install -m 0644 "$tmp" "$VIGIL_PKGLIST"
  rm -f "$tmp"
}
```

Then in a package recipe:

```sh
./configure --prefix=/usr
make
make install
vigil_record zlib 1.3.1
```

For BLFS packages you build by hand, run the same one-liner after the install
step. The version you pass is whatever you consider the installed version; keep it
consistent (upstream version, no local build suffix) so Vigil can compare it
cleanly against upstream releases.

## 3. Push the list (dry run first)

The `plaintext-push.sh` producer in `examples/producers/` reads the list, builds a
signed manifest, and posts it to Vigil. It needs three environment values: the
server URL and the API key pair you configured on the server.

```sh
export VIGIL_URL=http://localhost:3000
export API_KEY_ID=vigil-push-1
export API_KEY_SECRET=replace-with-random-shared-secret
```

Do a dry run the first time. This prints the manifest and the request headers to
standard error without sending anything, so you can confirm the list parsed the
way you expect:

```sh
examples/producers/plaintext-push.sh --dry-run /var/lib/vigil/packages.txt
```

When that looks right, drop `--dry-run` to push for real:

```sh
examples/producers/plaintext-push.sh /var/lib/vigil/packages.txt
```

A successful push returns a diff with added, removed, updated, and unchanged
counts. The producer needs `jq`, `curl`, and `openssl` on PATH; all three are
common on a BLFS system.

## 4. Push automatically on a schedule

Recording during builds keeps the list current; a nightly push keeps the
dashboard current even on days you do not build anything (Vigil re-checks upstream
and CVE data on its own schedule, and a fresh push makes sure it is comparing
against your latest list). A cron entry is enough:

```crontab
# Push the installed-package list to Vigil every night at 02:30.
30 2 * * * VIGIL_URL=http://localhost:3000 API_KEY_ID=vigil-push-1 API_KEY_SECRET=replace-with-random-shared-secret /opt/vigil/examples/producers/plaintext-push.sh /var/lib/vigil/packages.txt >/dev/null 2>&1
```

Adjust the path to wherever the producer script lives on your system. If you would
rather not put the secret in the crontab, source it from a root-only env file in
the command instead.

## 5. What to expect on the dashboard

After the first push, open the dashboard and look at two places:

- **Packages / Updates.** Every package you pushed appears. For packages Vigil
  recognizes, it auto-detects an upstream source (GNU FTP, a GitHub or GitLab
  project, the kernel, KDE, PyPI, and so on) and starts reporting whether a newer
  version exists. This detection is case-insensitive and understands a few common
  name variants (for example `python` is treated as `python3`).
- **Coverage.** This page shows how many of your packages have an upstream source
  configured versus how many are still unmapped. A brand new system will have some
  unmapped packages; that is normal.

Unmapped packages are ones Vigil could not match to a known upstream automatically.
They still show up and still get CVE matching by name, but they will not report
"a newer version is available" until they have a source. For those oddballs, open
the package detail page and configure a source by hand. The **generic** source
type is the catch-all: point it at a page or directory that lists released
versions and give it a pattern to find them, and Vigil will track it like any
other. This is the right choice for small projects, vanity release pages, and
anything without a GitHub, GitLab, or GNU home.

You do not need to map everything on day one. Push your list, let auto-detect do
the bulk of the work, and fill in generic sources for the handful of packages that
matter most and did not map on their own.
