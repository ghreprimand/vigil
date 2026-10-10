import { config } from '../config.js';

type DateInput = Date | string | null | undefined;

function parts(d: Date, withTime: boolean): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: config.displayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime && { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }),
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** ISO-style date (YYYY-MM-DD) in the configured display time zone. */
export function fmtDate(d: DateInput): string {
  if (!d) return '';
  const p = parts(new Date(d), false);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO-style date and 24h time (YYYY-MM-DD HH:MM) in the configured display time zone. */
export function fmtDateTime(d: DateInput): string {
  if (!d) return '';
  const p = parts(new Date(d), true);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Month and year (e.g. "October 2026") in the configured display time zone. */
export function fmtMonthYear(d: Date = new Date()): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: config.displayTimeZone });
}
