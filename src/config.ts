import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(val.toLowerCase());
}

function requiredWhen(condition: boolean, key: string, fallback = ''): string {
  return condition ? required(key) : optional(key, fallback);
}

function authMode(): 'none' | 'password' | 'oidc' {
  const mode = optional('AUTH_MODE', 'password');
  if (mode !== 'none' && mode !== 'password' && mode !== 'oidc') {
    throw new Error('AUTH_MODE must be one of: none, password, oidc');
  }
  return mode;
}

function cookieSecure(baseUrl: string): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override) return optionalBool('COOKIE_SECURE', false);
  return new URL(baseUrl).protocol === 'https:';
}

const mode = authMode();
const baseUrl = required('BASE_URL');
const smtpEnabled = optionalBool('SMTP_ENABLED', false);

export const brand = {
  productName: 'Vigil',
  kernelPackage: 'linux',
  userAgent: 'vigil/1.0',
  supportEmail: 'admin@example.com',
  fromEmail: 'vigil@example.com',
};

export const config = {
  port: optionalInt('PORT', 3100),
  host: optional('HOST', '127.0.0.1'),
  nodeEnv: optional('NODE_ENV', 'development'),
  baseUrl,
  logLevel: optional('LOG_LEVEL', 'info'),
  // IANA time zone for dates shown in the dashboard and emails. Defaults to
  // the server's local zone (set TZ or DISPLAY_TIMEZONE to override).
  displayTimeZone: optional('DISPLAY_TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone),

  projectRoot: resolve(__dirname, '..'),

  // Optional markdown file surfaced on the Help page (assistant prompt context).
  // If the file does not exist, the Help page shows a placeholder.
  helpContextFile: resolve(
    __dirname,
    '..',
    optional('HELP_CONTEXT_FILE', 'data/help-context.md'),
  ),

  db: {
    // SQLite database file. Directory is auto-created at startup.
    path: resolve(__dirname, '..', optional('DATABASE_PATH', 'data/vigil.db')),
  },

  api: {
    keyId: required('API_KEY_ID'),
    keySecret: required('API_KEY_SECRET'),
    timestampWindowMs: optionalInt('HMAC_TIMESTAMP_WINDOW_MS', 5 * 60 * 1000), // 5 minutes
  },

  auth: {
    mode,
    username: requiredWhen(mode === 'password', 'AUTH_USERNAME', 'admin'),
    passwordHash: requiredWhen(mode === 'password', 'AUTH_PASSWORD_HASH'),
  },

  oidc: {
    issuer: requiredWhen(mode === 'oidc', 'OIDC_ISSUER'),
    clientId: requiredWhen(mode === 'oidc', 'OIDC_CLIENT_ID'),
    clientSecret: requiredWhen(mode === 'oidc', 'OIDC_CLIENT_SECRET'),
    redirectUri: requiredWhen(mode === 'oidc', 'OIDC_REDIRECT_URI'),
  },

  session: {
    secret: required('SESSION_SECRET'),
    cookieSecure: cookieSecure(baseUrl),
  },

  smtp: {
    enabled: smtpEnabled,
    host: requiredWhen(smtpEnabled, 'SMTP_HOST', 'smtp.example.com'),
    port: optionalInt('SMTP_PORT', 587),
    user: requiredWhen(smtpEnabled, 'SMTP_USER'),
    pass: requiredWhen(smtpEnabled, 'SMTP_PASS'),
    from: requiredWhen(smtpEnabled, 'SMTP_FROM', brand.fromEmail),
    alertEmail: requiredWhen(smtpEnabled, 'ALERT_EMAIL', brand.supportEmail),
  },

  github: {
    token: optional('GITHUB_TOKEN', ''),
  },

  nvd: {
    apiKey: optional('NVD_API_KEY', ''),
  },

} as const;

export type Config = typeof config;
