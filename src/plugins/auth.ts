import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scryptSync, timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { verifyHmac } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

function isExternalHttpsUrl(value: string): boolean {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  return url.protocol === 'https:' && !localHosts.has(host);
}

export async function verifyPasswordHash(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [scheme, params, salt, hash] = encodedHash.split('$');
    if (scheme !== 'scrypt' || !params || !salt || !hash || !/^[0-9a-f]+$/i.test(hash)) return false;

    const parsed = Object.fromEntries(params.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, Number(value)];
    }));
    if (!parsed.N || !parsed.r || !parsed.p) return false;

    const expected = Buffer.from(hash, 'hex');
    const derived = scryptSync(password, salt, expected.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// HMAC auth for API endpoints (manifest push, source seed)
export const hmacAuth = fp(async function hmacAuth(app: FastifyInstance) {
  app.decorate('verifyHmac', async (request: FastifyRequest, reply: FastifyReply) => {
    const keyId = request.headers['x-api-key-id'] as string;
    const signature = request.headers['x-signature'] as string;
    const timestamp = request.headers['x-timestamp'] as string;

    if (!keyId || !signature || !timestamp) {
      return reply.status(401).send({ error: 'Missing auth headers' });
    }

    if (keyId !== config.api.keyId) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const ts = parseInt(timestamp, 10);
    const now = Date.now();
    if (Math.abs(now - ts) > config.api.timestampWindowMs) {
      return reply.status(401).send({ error: 'Timestamp outside window' });
    }

    const body = request.body != null
      ? (typeof request.body === 'string' ? request.body : JSON.stringify(request.body))
      : '';
    const payload = `${timestamp}.${body}`;

    if (!verifyHmac(config.api.keySecret, payload, signature)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }
  });
});

// Session-based auth for dashboard
export const sessionAuth = fp(async function sessionAuth(app: FastifyInstance) {
  if (config.auth.mode === 'none' && isExternalHttpsUrl(config.baseUrl)) {
    logger.warn(
      { baseUrl: config.baseUrl },
      'AUTH_MODE=none disables dashboard login. Use this only behind trusted network or proxy access control.',
    );
  }

  app.decorate('requireLogin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (config.auth.mode === 'none') {
      return;
    }

    const user = request.session?.get('user');
    if (!user) {
      return reply.redirect(`/auth/login?redirect=${encodeURIComponent(request.url)}`);
    }
  });
});

// Lightweight CSRF protection via Origin/Referer header check
export const csrfCheck = async (request: FastifyRequest, reply: FastifyReply) => {
  // Only check state-changing methods
  if (request.method !== 'POST' && request.method !== 'DELETE' && request.method !== 'PUT' && request.method !== 'PATCH') {
    return;
  }

  const origin = request.headers['origin'];
  const referer = request.headers['referer'];

  // If neither header is present and the request has a session, allow it
  // (some browsers don't send Origin on same-origin POSTs)
  if (!origin && !referer) {
    return;
  }

  const allowedOrigin = new URL(config.baseUrl).origin;
  const headerToCheck = origin || referer!;

  try {
    const requestOrigin = new URL(headerToCheck).origin;
    if (requestOrigin !== allowedOrigin) {
      logger.warn({ origin: headerToCheck, expected: allowedOrigin }, 'CSRF validation failed');
      return reply.status(403).send({ error: 'CSRF validation failed' });
    }
  } catch {
    logger.warn({ origin: headerToCheck }, 'CSRF validation failed: malformed Origin/Referer');
    return reply.status(403).send({ error: 'CSRF validation failed' });
  }
};

declare module 'fastify' {
  interface FastifyInstance {
    verifyHmac: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireLogin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface Session {
    user?: { sub: string; email: string; name: string };
    sessionCreatedAt?: number;
    oidc?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      redirectTo: string;
    };
  }
}
