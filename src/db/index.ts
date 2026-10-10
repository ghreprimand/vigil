import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { SQL } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import * as schema from './schema.js';

// Ensure the parent directory for the SQLite file exists (bare-metal first run).
mkdirSync(dirname(config.db.path), { recursive: true });

const sqlite = new Database(config.db.path);

// Reliability pragmas for a single-process web + worker workload.
// busy_timeout must come first: switching a fresh file to WAL takes a lock,
// and another connection opening the same file at the same moment would
// otherwise fail immediately with SQLITE_BUSY.
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

// Custom scalar used by the raw "pick latest upstream release" queries.
// Postgres used string_to_array(regexp_replace(...))::int[] to break ties
// between releases sharing a release_date; SQLite has no array type, so we
// register a scalar that maps a version to a zero-padded, lexicographically
// sortable key (each numeric run padded to 8 digits).
sqlite.function('ver_key', { deterministic: true }, (v: unknown): string => {
  if (v == null) return '';
  const parts = String(v).match(/\d+/g);
  if (!parts) return '';
  return parts.map((n) => n.padStart(8, '0')).join('.');
});

const base = drizzle(sqlite, { schema });

/**
 * Recursively convert JSON-text column values back into JS objects/arrays.
 *
 * Drizzle's query builder (`.select()`) already parses `{ mode: 'json' }`
 * columns via the schema, but RAW `sql` queries executed through `execute()`
 * return JSON columns as their stored text. We opportunistically parse any
 * string value that begins with `[` or `{` and is valid JSON. Plain prose
 * columns (descriptions, reasons, titles) never start with those characters in
 * this domain, so this is safe and keeps the raw query call sites unchanged.
 */
function maybeParseJson(v: unknown): unknown {
  if (typeof v !== 'string' || v.length === 0) return v;
  const c = v.charCodeAt(0);
  // 91 = '[', 123 = '{'
  if (c !== 91 && c !== 123) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function parseRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const k in row) {
    row[k] = maybeParseJson(row[k]);
  }
  return row;
}

/**
 * Postgres-compatible shim for the raw-SQL call sites that used
 * `db.execute(sql\`...\`)`. Returns an array of row objects for SELECT-shaped
 * queries (with JSON columns parsed), or runs the statement and returns [] for
 * INSERT/UPDATE/DELETE. Synchronous under the hood; call sites `await` the
 * result harmlessly.
 */
function execute<T = Record<string, unknown>>(query: SQL): T[] {
  try {
    const rows = base.all(query) as Record<string, unknown>[];
    return rows.map(parseRow) as unknown as T[];
  } catch (err) {
    if (err instanceof Error && /does not return data/.test(err.message)) {
      base.run(query);
      return [] as T[];
    }
    throw err;
  }
}

export const db = Object.assign(base, { execute });
export { schema };
