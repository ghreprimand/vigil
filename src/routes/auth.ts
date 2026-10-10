import { FastifyInstance } from 'fastify';
import * as oidc from 'openid-client';
import { config } from '../config.js';
import { verifyPasswordHash } from '../plugins/auth.js';
import { logger } from '../utils/logger.js';

let oidcConfig: oidc.Configuration | null = null;

async function getOidcConfig(): Promise<oidc.Configuration> {
  if (config.auth.mode !== 'oidc') {
    throw new Error('OIDC auth is not enabled');
  }

  if (!oidcConfig) {
    oidcConfig = await oidc.discovery(
      new URL(config.oidc.issuer),
      config.oidc.clientId,
      config.oidc.clientSecret,
    );
  }
  return oidcConfig;
}

function safeRedirect(raw: string | undefined): string {
  const redirectTo = raw || '/';
  return redirectTo.startsWith('/') && !redirectTo.startsWith('//') && !redirectTo.includes('://')
    ? redirectTo
    : '/';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function passwordLoginForm(redirectTo: string, error = ''): string {
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in - Vigil</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #f6f7f9; color: #172033; }
    main { width: min(100% - 2rem, 24rem); background: #fff; border: 1px solid #d8dde6; border-radius: 8px; padding: 1.5rem; box-shadow: 0 8px 30px rgb(15 23 42 / 0.08); }
    h1 { margin: 0 0 1rem; font-size: 1.35rem; }
    label { display: block; margin: 0.8rem 0 0.3rem; font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #b8c0cc; border-radius: 6px; font: inherit; }
    button { width: 100%; margin-top: 1rem; padding: 0.7rem 0.85rem; border: 0; border-radius: 6px; background: #204b8f; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .error { padding: 0.65rem 0.75rem; border: 1px solid #c84a4a; border-radius: 6px; background: #fff0f0; color: #8a1f1f; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in to Vigil</h1>
    ${errorHtml}
    <form method="post" action="/auth/login">
      <input type="hidden" name="redirect" value="${escapeHtml(redirectTo)}">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

export async function authRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { redirect?: string } }>('/auth/login', async (request, reply) => {
    if (config.auth.mode === 'none') {
      return reply.redirect(safeRedirect(request.query.redirect));
    }

    if (config.auth.mode === 'password') {
      const redirectTo = safeRedirect(request.query.redirect);
      return reply.type('text/html').send(passwordLoginForm(redirectTo));
    }

    const cfg = await getOidcConfig();

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    request.session.set('oidc', {
      state,
      nonce,
      codeVerifier,
      redirectTo: request.query.redirect || '/',
    });

    const authUrl = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: config.oidc.redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(authUrl.href);
  });

  app.post<{ Body: { username?: string; password?: string; redirect?: string } }>('/auth/login', async (request, reply) => {
    if (config.auth.mode !== 'password') {
      return reply.status(404).send({ error: 'Password auth is not enabled' });
    }

    const redirectTo = safeRedirect(request.body.redirect);
    const username = request.body.username || '';
    const password = request.body.password || '';
    const validUsername = username === config.auth.username;
    const validPassword = await verifyPasswordHash(password, config.auth.passwordHash);

    if (!validUsername || !validPassword) {
      return reply.status(401).type('text/html').send(passwordLoginForm(redirectTo, 'Invalid username or password'));
    }

    request.session.set('user', {
      sub: `password:${config.auth.username}`,
      email: '',
      name: config.auth.username,
    });
    request.session.set('sessionCreatedAt', Date.now());

    return reply.redirect(redirectTo);
  });

  app.get('/auth/callback', async (request, reply) => {
    if (config.auth.mode !== 'oidc') {
      return reply.status(404).send({ error: 'OIDC auth is not enabled' });
    }

    const cfg = await getOidcConfig();
    const session = request.session.get('oidc') as {
      state: string;
      nonce: string;
      codeVerifier: string;
      redirectTo: string;
    } | undefined;

    if (!session) {
      return reply.status(400).send({ error: 'No OIDC session state. Start login again.' });
    }

    try {
      const callbackUrl = new URL(request.url, config.baseUrl);
      const tokens = await oidc.authorizationCodeGrant(cfg, callbackUrl, {
        pkceCodeVerifier: session.codeVerifier,
        expectedState: session.state,
        expectedNonce: session.nonce,
      });

      const claims = tokens.claims();
      if (!claims) {
        throw new Error('No claims in token response');
      }

      request.session.set('user', {
        sub: claims.sub,
        email: (claims as Record<string, unknown>).email as string || '',
        name: (claims as Record<string, unknown>).name as string || claims.sub,
      });
      request.session.set('sessionCreatedAt', Date.now());
      request.session.set('oidc', undefined);

      return reply.redirect(safeRedirect(session.redirectTo));
    } catch (err) {
      logger.error({ err }, 'OIDC callback error');
      return reply.status(401).view('pages/error.ejs', {
        title: 'Authentication Failed',
        statusCode: 401,
        message: 'Authentication failed. Please try again.',
      });
    }
  });

  app.get('/auth/logout', async (request, reply) => {
    request.session.destroy();

    if (config.auth.mode === 'oidc') {
      try {
        const cfg = await getOidcConfig();
        const endSessionUrl = oidc.buildEndSessionUrl(cfg, {
          post_logout_redirect_uri: config.baseUrl,
        });
        return reply.redirect(endSessionUrl.href);
      } catch {
        return reply.redirect('/');
      }
    }

    return reply.redirect('/');
  });
}
