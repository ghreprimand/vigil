// Minimal env shim so importing modules that pull in src/config.ts during
// pure-function tests doesn't blow up. Each test process gets its own
// throwaway SQLite file (the test runner runs files in parallel, and a shared
// file races on first open), removed again on exit. No real services are
// contacted as long as the tests only call pure helpers.
//
// Import this file FIRST in every test file that pulls in DB-touching code.

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testDbPath = join(tmpdir(), `vigil-test-${process.pid}.db`);
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(testDbPath + suffix, { force: true });
});

const defaults: Record<string, string> = {
  BASE_URL: 'http://localhost:3000',
  DATABASE_PATH: testDbPath,
  API_KEY_ID: 'test-key',
  API_KEY_SECRET: 'test-secret',
  AUTH_MODE: 'password',
  AUTH_USERNAME: 'admin',
  AUTH_PASSWORD_HASH: 'scrypt$N=16384,r=8,p=1$change-me-salt$732bf368453209802df2524fad32d8655f7f9699d2efba46cb86d96f2968fd383f5492b99733fa4fe39f14a87adc466e442fee5165764deb3459a8fccdf27865',
  OIDC_ISSUER: 'http://localhost/issuer',
  OIDC_CLIENT_ID: 'test',
  OIDC_CLIENT_SECRET: 'test',
  OIDC_REDIRECT_URI: 'http://localhost/cb',
  SESSION_SECRET: 'test-session-secret-must-be-at-least-32-bytes-long',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '25',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
  SMTP_FROM: 'test@example.com',
  ALERT_TO: 'test@example.com',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
