# Deployment

Vigil runs as a single Node process with an embedded SQLite database. There are
no external services to install or manage: no PostgreSQL, no Redis, no message
broker. Background jobs run on an in-process scheduler, sessions live in SQLite,
and the database is a single file on disk.

This page covers three ways to run it, from quickest to most manual:

- **Path A: Docker Compose** - one container plus a named data volume. Best for a
  first look or a small LAN deployment.
- **Path B: Docker (plain `docker run`)** - the same image with a bind-mounted or
  named volume for the database file. Use this when you do not want Compose.
- **Path C: Bare metal** - Node 22 and nothing else. Common on LFS-style systems
  where you build everything from source and would rather not add Docker.

All three paths use the same environment variables and the same schema. Pick the
one that matches how you already run services.

Vigil is designed for two deployment profiles regardless of path:

- **LAN-local**: plain HTTP on a trusted local network.
- **External**: an HTTPS reverse proxy in front of the app.

The app listens on `PORT`. The only storage it needs is the SQLite file pointed
to by `DATABASE_PATH`; its parent directory is created automatically on first
start. The manifest API always uses HMAC authentication, independent of the
dashboard auth mode.

## Migrations run themselves

The server applies its database migrations automatically at startup, before it
begins listening. A brand new database file is created and populated on the first
run; on later upgrades that ship new migration files, the new migrations are
applied the next time the server starts. Migrations are additive and safe to
re-apply, so there is nothing to run by hand.

An optional `npm run db:migrate:run` (or `npm run db:migrate` via drizzle-kit) is
available if you ever want to apply migrations out of band, for example in a CI
check, but no deployment path requires it.

## Required Settings

Set these values in `.env` (bare metal) or in the container environment (Docker):

```sh
BASE_URL=http://localhost:3000
DATABASE_PATH=data/vigil.db
API_KEY_ID=vigil-push-1
API_KEY_SECRET=replace-with-random-shared-secret
SESSION_SECRET=replace-with-random-session-secret-at-least-32-bytes
AUTH_MODE=password
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=scrypt$N=16384,r=8,p=1$replace-salt$replace-hash
```

`DATABASE_PATH` is a file path. A relative path resolves against the app root; an
absolute path (for example `/var/lib/vigil/vigil.db`) is fine too. The directory
is created if it does not exist.

Generate a password hash:

```sh
node -e 'const {scryptSync,randomBytes}=require("crypto"); const password=process.argv[1]; const salt=randomBytes(16).toString("hex"); const hash=scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString("hex"); console.log(`scrypt$N=16384,r=8,p=1$${salt}$${hash}`)' 'replace-with-admin-password'
```

Use a long random value for `API_KEY_SECRET` and `SESSION_SECRET`. A convenient
way to generate one:

```sh
node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
```

## Path A: Docker Compose (quickest)

Requires Docker Engine and the Compose v2 plugin, invoked as `docker compose`
(two words). The older standalone `docker-compose` (hyphenated, v1) is deprecated
upstream and is not what these instructions assume; check with:

```sh
docker compose version
```

Bring up the single app container:

```sh
cp .env.example .env
docker compose up --build
```

The container starts the server, which auto-applies migrations and then listens
on `PORT` (default `3000`). Open `http://localhost:3000`.

The compose file declares a named volume `vigil-data` mounted at `/app/data`, and
sets `DATABASE_PATH=/app/data/vigil.db`, so the database survives
`docker compose down` and container rebuilds. To wipe all data and start fresh,
remove the volume with `docker compose down -v`.

### The shipped default credential

`docker-compose.yml` ships a default `AUTH_PASSWORD_HASH` so the stack works with
zero configuration on first run. This corresponds to username `admin` and
password `change-me`. This is a publicly known credential baked into a public
file: anyone who has read the compose file knows it. It exists only so the demo
boots without a manual hashing step.

Before you expose Vigil to anything other than `localhost` on your own machine,
generate a real hash with the command above and set `AUTH_PASSWORD_HASH` (and
optionally `AUTH_USERNAME`) in `.env`, then restart the stack. Do not run the
default credential on a LAN with untrusted devices, and never on an
external/VPS deployment.

## Path B: Docker with `docker run`

Use this when you want the container but not Compose. Build the image, then run it
with a volume for the database file so data persists across restarts.

Build the image:

```sh
docker build -t vigil .
```

Run it with a named volume mounted at `/app/data`:

```sh
docker run -d \
  --name vigil \
  -p 3000:3000 \
  -v vigil-data:/app/data \
  -e BASE_URL=http://localhost:3000 \
  -e DATABASE_PATH=/app/data/vigil.db \
  -e API_KEY_ID=vigil-push-1 \
  -e API_KEY_SECRET=replace-with-random-shared-secret \
  -e SESSION_SECRET=replace-with-random-session-secret-at-least-32-bytes \
  -e AUTH_MODE=password \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD_HASH='scrypt$N=16384,r=8,p=1$replace-salt$replace-hash' \
  vigil
```

The server creates and migrates the database at `/app/data/vigil.db` on first
start. You can also bind-mount a host directory instead of a named volume, for
example `-v /srv/vigil/data:/app/data`, if you prefer the file to live at a known
path on the host. The image runs as a non-root user and owns `/app/data`, so a
fresh named volume inherits writable permissions automatically.

## Path C: Bare metal

The lightest option, and the one designed for source-built systems: the only
runtime dependency is Node 22. There is no database server to provision.

1. Install Node 22 with your normal build process and confirm it is reachable:

   ```sh
   node --version
   ```

2. Clone or copy the Vigil source, then install, build, and start:

   ```sh
   cp .env.example .env
   # edit .env: set BASE_URL, the API/session secrets, and AUTH_PASSWORD_HASH
   npm ci
   npm run build
   npm start
   ```

`npm start` runs `node dist/server.js`, which creates the `data/` directory,
applies migrations, and starts serving. There is no separate migrate step. On a
later upgrade you pull the new source, run `npm ci && npm run build`, and start
again; any new migrations apply themselves on that next start.

To run Vigil under a process supervisor (systemd, runit, and so on), point the
unit at `npm start` (or directly at `node dist/server.js`) with the same
environment variables and the working directory set to the Vigil checkout. Give
the service write access to whatever `DATABASE_PATH` points at.

## LAN-Local Profile

Use this profile when Vigil is reachable only on a trusted local network, over
plain HTTP.

```sh
BASE_URL=http://localhost:3000
AUTH_MODE=password
COOKIE_SECURE=false
```

`COOKIE_SECURE=false` is required for plain HTTP; browsers will not send a
`Secure` cookie back over an unencrypted connection, which breaks login.
`AUTH_MODE=none` is available when another trusted layer already controls access,
such as a private LAN firewall or a local reverse proxy with its own auth. Do not
expose `AUTH_MODE=none` to the public internet.

## External Profile

Use this profile when Vigil is reachable from outside a trusted LAN. Put the app
behind a TLS reverse proxy and set `BASE_URL` to the public HTTPS URL.

```sh
BASE_URL=https://vigil.example.com
AUTH_MODE=password
COOKIE_SECURE=true
```

`COOKIE_SECURE=true` requires the browser to see the connection as HTTPS; this
only works correctly once a reverse proxy is terminating TLS in front of the app.

OIDC is also supported instead of the built-in password login:

```sh
AUTH_MODE=oidc
OIDC_ISSUER=https://idp.example.com/application/o/vigil/
OIDC_CLIENT_ID=replace-with-client-id
OIDC_CLIENT_SECRET=replace-with-client-secret
OIDC_REDIRECT_URI=https://vigil.example.com/auth/callback
```

### Caddy Example

```caddyfile
vigil.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Caddy issues and renews a TLS certificate automatically for a real domain name.

### Nginx Example

```nginx
server {
  listen 443 ssl;
  server_name vigil.example.com;

  ssl_certificate /etc/ssl/example/fullchain.pem;
  ssl_certificate_key /etc/ssl/example/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Email Notifications

Email is off by default. Enable it only when SMTP credentials are configured:

```sh
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=replace-with-smtp-user
SMTP_PASS=replace-with-smtp-password
SMTP_FROM=vigil@example.com
ALERT_EMAIL=admin@example.com
```

When `SMTP_ENABLED=false`, SMTP settings are placeholders and are not required.

## API Keys and Rate Limits

Two upstream data sources have optional API keys. Vigil works without either one,
but each raises a rate limit that background workers otherwise run into. Both are
plain optional environment variables; leave them empty to run unauthenticated.

```sh
GITHUB_TOKEN=
NVD_API_KEY=
```

**`GITHUB_TOKEN` (GitHub release checks).** The GitHub release worker checks each
package that has a GitHub upstream source. When the token is set it is sent as a
`Bearer` credential on every GitHub API call. Without it, requests are
unauthenticated and GitHub allows only 60 requests per hour per IP address. A
package set with many GitHub-mapped sources will exhaust that budget partway
through a run; when it does, the worker logs a rate-limit warning and skips the
remaining sources for that cycle, so those packages simply are not refreshed until
the next run after the limit resets. The worker already sends a conditional
`If-None-Match` request per source (ETag caching), which means unchanged repos
cost nothing against the limit, but a first run or a set with many active releases
still needs one full request each. A classic fine-grained personal access token
with no scopes (public read only) lifts the limit to 5000 requests per hour, which
comfortably covers a large package set. Create one at
`https://github.com/settings/tokens`.

**`NVD_API_KEY` (CVE sync).** The `nvd-cve` worker pages through the National
Vulnerability Database. When the key is set it is sent as the `apiKey` request
header and the worker paces its page requests 650 ms apart. Without a key it slows
to 6500 ms between pages - a tenfold slowdown - to stay under NVD's stricter
unauthenticated limit, so a full CVE sync simply takes much longer. The data is
the same either way; only the speed differs. A free key from
`https://nvd.nist.gov/developers/request-an-api-key` removes the throttle.

Both keys are optional and can be added at any time; set them in `.env` (bare
metal) or the container environment (Docker) and restart. Nothing else needs to
change.

## Manifest Producers

Once the app is running and you can log in, the next step is telling Vigil what is
installed. Vigil has no package manager of its own; a small producer script reads
your source of truth and pushes a signed manifest.

Configure a producer with the same API key pair the server uses:

```sh
VIGIL_URL=http://localhost:3000
API_KEY_ID=vigil-push-1
API_KEY_SECRET=replace-with-random-shared-secret
```

### Worked example: plain text list

If you track installed packages as a simple `name version` list (typical for an
LFS build log), use `plaintext-push.sh`:

```sh
cat <<'EOF' > /tmp/packages.txt
zlib 1.3.1
openssl 3.5.0
bash 5.2.32
EOF

VIGIL_URL=http://localhost:3000 \
API_KEY_ID=vigil-push-1 \
API_KEY_SECRET=replace-with-random-shared-secret \
examples/producers/plaintext-push.sh /tmp/packages.txt
```

This reads each `name version` line, builds a compact JSON manifest, signs it with
HMAC-SHA256 over `${timestamp}.${body}`, and posts it to `POST /api/v1/manifest`.
A successful push returns a package diff (added/removed/updated/unchanged counts).
Lines starting with `#` are ignored, so you can keep the file as a lightly
commented build log.

Use `--dry-run` to print the manifest and headers without sending anything, which
is useful the first time you wire up a producer:

```sh
examples/producers/plaintext-push.sh --dry-run /tmp/packages.txt
```

See [manifest-contract.md](manifest-contract.md) for the full wire format,
[lfs-integration.md](lfs-integration.md) for wiring a push into your build
routine, and [../examples/producers](../examples/producers) for both reference
producers.

## Troubleshooting

**Server will not start / cannot open the database.** Confirm the process has
write permission to the directory that `DATABASE_PATH` points at. On bare metal
this is usually the `data/` directory under the checkout; under a supervisor,
make sure the service user owns it. In Docker, confirm the volume is mounted at
the directory containing the database file (`/app/data` by default).

**"database is locked" or "SQLITE_BUSY" in the logs.** Vigil opens the database
in WAL mode with a five second busy timeout, which handles the normal overlap
between the web server and the background workers in one process. If you see this
error, the usual cause is a second process holding the same database file, for
example a leftover instance or an external tool (a `sqlite3` shell, a backup job)
that opened it. Run only one Vigil process per database file, and prefer copying
the file while the app is stopped, or using SQLite's online backup, rather than
opening it read-write from another tool.

**HMAC signature mismatch on a manifest push.** The server recomputes the
signature over `${timestamp}.${JSON.stringify(body)}` exactly as it parsed the
body. The most common cause is extra whitespace introduced by a JSON serializer;
the reference producers pipe through `jq -c` for this reason. Confirm `API_KEY_ID`
and `API_KEY_SECRET` on the producer side match the server's configuration
exactly, and that the clock on the producer host is reasonably close to the
server's (requests outside `HMAC_TIMESTAMP_WINDOW_MS` are rejected).

**Cannot log in over plain HTTP.** If `BASE_URL` is `http://` and `COOKIE_SECURE`
is left at its default or set to `true`, the browser will not send the session
cookie back and login silently fails on the next request. Set `COOKIE_SECURE=false`
for a plain-HTTP LAN-local deployment, and only use `COOKIE_SECURE=true` once a
reverse proxy is providing real TLS in front of the app.

**Forgot the admin password.** Generate a new hash with the command in "Required
Settings" above and set `AUTH_PASSWORD_HASH` to the new value, then restart the
app. There is no password reset flow beyond replacing this environment variable.

## Backups

Because the whole database is one file, a backup is a file copy. The safest way is
to stop the app and copy `DATABASE_PATH` (and, if present, the `-wal` and `-shm`
sidecar files) somewhere else. If you need a hot backup while the app runs, use
SQLite's built-in online backup rather than a plain `cp`, so you capture a
consistent snapshot:

```sh
sqlite3 data/vigil.db ".backup '/path/to/vigil-backup.db'"
```

Restoring is the reverse: stop the app, put the file back at `DATABASE_PATH`, and
start again.
