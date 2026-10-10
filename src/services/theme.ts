import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

let _cachedTheme: string | null = null;

export async function getSavedTheme(): Promise<string> {
  if (_cachedTheme !== null) return _cachedTheme;
  const [row] = await db.select({ value: schema.settings.value })
    .from(schema.settings).where(eq(schema.settings.key, 'ui_theme')).limit(1);
  _cachedTheme = (row?.value as string) || 'default';
  return _cachedTheme;
}

export function setSavedThemeCache(id: string) { _cachedTheme = id; }
