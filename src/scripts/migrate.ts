import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';

// Optional standalone migration runner. The server auto-migrates at startup, so
// this is only needed for out-of-band schema application (e.g. CI checks).
function main(): void {
  mkdirSync(dirname(config.db.path), { recursive: true });
  const sqlite = new Database(config.db.path);
  sqlite.pragma('journal_mode = WAL');
  try {
    migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
    console.log('migrations applied');
  } finally {
    sqlite.close();
  }
}

try {
  main();
  process.exit(0);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`migration failed: ${message}`);
  process.exit(1);
}
