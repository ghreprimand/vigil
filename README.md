# Vigil

**Upstream release and CVE tracking for source-built Linux systems.**

> Note: early development placeholder. Vigil is being built in the open. This README
> describes where the project is headed. The code is not published yet. Star or watch
> the repo to follow along.

## What is Vigil?

Vigil is a self-hosted monitoring service for source-built Linux systems such as Linux
From Scratch (LFS/BLFS), Gentoo-style source trees, and other custom or from-scratch
builds.

If you maintain a system you compiled yourself, you do not get a distribution's update
notifier telling you when something is out of date or has a known vulnerability. Vigil
fills that gap. You push a manifest of what is installed, and Vigil reports:

- **What is out of date.** It tracks upstream releases (GitHub, GitLab, GNU, PyPI, KDE,
  kernel.org, Flathub, and generic sources) and compares them to your installed versions.
- **What is vulnerable.** It matches your packages against CVE feeds and security
  advisories, and alerts on the ones that matter.
- **What is drifting.** A staleness score highlights packages falling behind, so you can
  plan rebuilds.

It presents all of this in a web dashboard with per-package detail, dependency
information, vulnerability tracking, and optional email notifications.

## What Vigil is not

Vigil does not install, build, or remove packages. It is a monitor, not a package
manager. It never touches your system. It reads a manifest you send it and reports back.
You stay in full control of your own builds.

## Package-manager agnostic

Vigil ingests a simple, documented JSON manifest over an authenticated HTTP endpoint, so
it works regardless of how your system is built:

- Using a package manager such as pacman? A small producer script turns its database into
  the manifest.
- Pure LFS with no package manager at all? A plain-text producer (one `name version` per
  line) is all you need.
- Custom build system? Emit the documented JSON yourself in a few lines.

Reference producer scripts will ship in `examples/`.

## Hosting

Vigil is designed to run either on a home or LAN server or on an internet-facing VPS:

- **LAN-local.** Bring it up with Docker Compose on a box on your network. No identity
  provider or TLS certificate is required for a trusted LAN.
- **External or VPS.** Run it behind a reverse proxy for automatic HTTPS.

Authentication is configurable: no login for a trusted LAN, a single-user password, or
full OIDC single sign-on.

## Status and roadmap

Vigil is being built toward a first public release. Planned for that release:

- Core release-tracking and CVE engine
- Web dashboard
- Neutral JSON manifest contract and reference producer scripts
- Docker Compose quickstart
- Configurable authentication (none, password, or OIDC)

## License

To be confirmed. Intended as permissive open source.
