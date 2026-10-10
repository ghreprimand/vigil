# Vigil

Upstream release, CVE, and staleness tracking for source-built Linux systems.

Vigil is a self-hosted monitor for Linux systems where the installed software set is built from source, assembled by hand, or managed outside a mainstream distribution update path. It is designed for LFS/BLFS, Gentoo-style workflows, custom package sets, and local build systems.

## What It Is

Vigil tracks the software you say is installed and compares it with upstream release data, vulnerability data, and local freshness rules. It provides a web dashboard for release status, CVE exposure, package detail, and stale package review.

The system is package-manager agnostic. Producers submit a JSON manifest to an authenticated HTTP endpoint. A producer can read from a package database, a build log, a text file, or any other local source of truth.

## What It Is Not

Vigil does not install, build, upgrade, downgrade, or remove packages. It is not an apt, pacman, emerge, or dnf replacement. It does not mutate the monitored system.

Vigil reports what needs attention. Your build scripts, package manager, or manual process remain responsible for changes.

## Architecture

Vigil is a single Node process with no external service dependencies:

- Fastify for HTTP routes and API endpoints
- SQLite (via better-sqlite3) for persistent data, accessed through Drizzle
- An in-process cron scheduler (croner) for background jobs, with no message broker
- SQLite-backed dashboard sessions
- EJS for server-rendered dashboard views

There is no PostgreSQL, no Redis, and nothing else to run alongside it. The whole
database is a single file on disk. Workers collect upstream release metadata, CVE
data, and package freshness signals; the dashboard reads from the database and
presents the current status.

## Quickstart

The fastest way to try Vigil is Docker Compose, which runs the single app
container and applies the database migration automatically on startup:

```sh
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:3000` and log in with `admin` / `change-me`. This default credential ships in the compose file for a zero-config first run; change it before using Vigil beyond your own machine. See [docs/deployment.md](docs/deployment.md).

Two other install paths are documented there:

- Docker with a plain `docker run` and a volume for the database file.
- Bare metal: install Node 22 (the only runtime dependency), then `npm ci && npm run build && npm start`. Migrations apply themselves at startup.

## Ingestion

Package state enters Vigil through `POST /api/v1/manifest`. The request body is a compact JSON document:

```json
{"packages":[{"name":"zlib","version":"1.3.1"}]}
```

See [docs/manifest-contract.md](docs/manifest-contract.md) for the full contract and HMAC signing rules.

Reference producers are in [examples/producers](examples/producers):

- `pacman-push.sh` reads an installed pacman database.
- `plaintext-push.sh` reads `name version` lines from a file or standard input.

These scripts are examples. For a custom source-built system, write a producer that emits the same manifest contract from your own source of truth.

Running LFS or BLFS? See [docs/lfs-integration.md](docs/lfs-integration.md) for a start-to-finish integration guide, from a package list to a nightly push.

## Dashboard

The web dashboard is where you read what Vigil found. The main pages are:

- **Overview** - at-a-glance summary: counts of stale packages, pending updates, and open CVEs.
- **Packages** - every tracked package with its current version, freshness, and upstream status.
- **Updates** - packages with a newer upstream release than what you have installed.
- **CVEs** - known vulnerabilities matched to your packages, with severity and fix status.
- **Coverage** - which packages have upstream sources wired up, and which are still unmonitored.
- **Batches** - grouped update runs, for reviewing a set of upgrades together.
- **Advisories** - your own written notes and advisories attached to packages.
- **KB** - the knowledge base of per-package build and upgrade notes.
- **Activity** - a running log of what the workers and pushes have done.

Every page carries a built-in contextual help system: a floating `?` button turns
on help mode, where any highlighted element can be clicked for an inline
explanation. A dedicated Help page collects the same guidance in one place.

## Authentication

Dashboard authentication is configurable with `AUTH_MODE`:

- `password` is the default single-admin mode.
- `none` is for trusted LAN deployments or deployments where a reverse proxy handles access control.
- `oidc` is for an external identity provider.

Manifest API authentication uses HMAC headers and is independent of dashboard auth mode.

## License

Vigil is released under the MIT License. See [LICENSE](LICENSE).
