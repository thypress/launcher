// SPDX-FileCopyrightText: 2026 Teo Costa (THYPRESS <https://thypress.org>)
// SPDX-License-Identifier: MPL-2.0

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

// ============================================================================
// LOCAL CONSTANTS
// ============================================================================

// Subset of MIME types and HTTP status codes used by admin routes.
// Defined locally to avoid a circular dependency with routes.js
// (routes.js imports handleAdmin from here; we can't import back from it).

const MIME_TYPES = {
  HTML: 'text/html; charset=utf-8',
  JSON: 'application/json; charset=utf-8'
};

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  SERVER_ERROR: 500
};

/**
 * Get MIME type for image files (used by handleThemePreview)
 * @param {string} filePath - File path to check
 * @returns {string} MIME type string
 */
function getImageMimeType(ext) {
  const types = {
    'png':  'image/png',
    'jpg':  'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'avif': 'image/avif'
  };
  return types[ext] || 'application/octet-stream';
}

// ============================================================================
// THEME PREVIEW
// ============================================================================

/**
 * Handle theme preview image requests.
 * Serves preview images from theme directories.
 * @param {string} themeId - Theme ID
 * @param {string} filename - Preview filename
 * @param {Request} request - HTTP request
 * @returns {Promise<Response|null>} Image response or null
 */
async function handleThemePreview(themeId, filename, request) {
  // Security: validate filename is actually a preview image
  const validExtensions = ['png', 'jpg', 'jpeg', 'webp', 'avif'];
  const ext = path.extname(filename).toLowerCase().substring(1);

  if (!validExtensions.includes(ext)) {
    return null;
  }

  // Security: prevent path traversal - validate RESOLVED path
  const templatesDir = path.resolve(process.cwd(), 'templates');
  const themePath = path.resolve(templatesDir, themeId, filename);

  // CRITICAL: Check if resolved path is within templates directory
  if (!themePath.startsWith(templatesDir)) {
    console.error(`Path traversal attempt blocked: ${filename}`);
    return null;
  }

  if (!fsSync.existsSync(themePath)) {
    return null;
  }

  try {
    const fileContent = await fs.readFile(themePath);
    const mimeType = getImageMimeType(ext);

    return new Response(fileContent, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error) {
    return null;
  }
}

// ============================================================================
// ADMIN PANEL ROUTER
// ============================================================================

/**
 * Handle admin panel routes.
 * All admin sub-routes are derived from adminBase at call time.
 * IP identification uses deps.bunServer (Bun's server.requestIP) for real client IPs.
 * @param {Request} request - HTTP request
 * @param {Object} deps - Dependencies (includes bunServer, securityManager, etc.)
 * @param {string} adminBase - Dynamic admin base path
 * @returns {Promise<Response>} Admin response
 */
export async function handleAdmin(request, deps, adminBase) {
  const url = new URL(request.url);
  const route = url.pathname;
  const securityManager = deps.securityManager;

  // Use Bun's native IP resolution via deps.bunServer (see security.js getClientIP)
  const ip = securityManager.getClientIP(request, deps.bunServer);

  // Derive all admin sub-routes from adminBase at call time.
  // No separate constant or helper needed — everything flows from one string.
  const loginRoute      = `${adminBase}/login`;
  const authRoute       = `${adminBase}/auth`;
  const challengeRoute  = `${adminBase}/auth/challenge`;
  const themesRoute     = `${adminBase}/themes`;
  const configRoute     = `${adminBase}/api/config`;
  const buildRoute      = `${adminBase}/build`;
  const clearCacheRoute = `${adminBase}/clear-cache`;
  const previewPrefix   = `${adminBase}/theme-preview/`;

  // Public: login page (no session required)
  if (route === loginRoute && request.method === 'GET') {
    const { generateLoginHTML } = await import('./admin-pages.js');
    const html = generateLoginHTML({ hasPin: securityManager.pin !== null, adminBase });
    return new Response(html, {
      headers: securityManager.applySecurityHeaders({ 'Content-Type': MIME_TYPES.HTML })
    });
  }

  // Public: PoW challenge (no session required)
  if (route === challengeRoute && request.method === 'GET') {
    const salt = securityManager.generatePowChallenge(ip);
    return new Response(JSON.stringify({ salt }), {
      headers: { 'Content-Type': MIME_TYPES.JSON }
    });
  }

  // Public: authentication endpoint (magic link or PIN + PoW)
  if (route === authRoute && request.method === 'POST') {
    try {
      const body = await request.json();
      const { token, pin, nonce } = body;

      // Magic link flow
      if (token) {
        if (securityManager.verifyMagicToken(token)) {
          const sessionId = securityManager.createSession(ip);
          return new Response(JSON.stringify({ success: true, redirect: `${adminBase}/` }), {
            headers: {
              'Content-Type': MIME_TYPES.JSON,
              'Set-Cookie': securityManager.createSessionCookie(sessionId)
            }
          });
        }
        return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
          status: 403,
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

      // PIN + PoW flow
      if (pin && nonce) {
        const rateLimit = securityManager.checkRateLimit(ip);
        if (!rateLimit.allowed) {
          return new Response(JSON.stringify({
            success: false,
            error: `Too many attempts. Try again in ${Math.ceil(rateLimit.backoffMs / 1000)}s`
          }), {
            status: 429,
            headers: { 'Content-Type': MIME_TYPES.JSON }
          });
        }

        if (!securityManager.verifyPowSolution(ip, nonce)) {
          securityManager.recordFailedAttempt(ip);
          return new Response(JSON.stringify({ success: false, error: 'Invalid proof of work' }), {
            status: 403,
            headers: { 'Content-Type': MIME_TYPES.JSON }
          });
        }

        if (!securityManager.verifyPIN(pin)) {
          securityManager.recordFailedAttempt(ip);
          return new Response(JSON.stringify({ success: false, error: 'Invalid PIN' }), {
            status: 403,
            headers: { 'Content-Type': MIME_TYPES.JSON }
          });
        }

        securityManager.resetRateLimit(ip);
        const sessionId = securityManager.createSession(ip);
        return new Response(JSON.stringify({ success: true, redirect: `${adminBase}/` }), {
          headers: {
            'Content-Type': MIME_TYPES.JSON,
            'Set-Cookie': securityManager.createSessionCookie(sessionId)
          }
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Invalid authentication method' }), {
        status: 400,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });

    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }
  }

  // Public: first-time PIN setup (only accepted when no PIN is configured yet)
  if (route === `${adminBase}/setup-pin` && request.method === 'POST') {
    // Reject if a PIN already exists — prevents overwriting without auth
    if (securityManager.pin !== null) {
      return new Response(JSON.stringify({ success: false, error: 'PIN already set' }), {
        status: 403,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }

    try {
      const body = await request.json();
      const { pin } = body;

      if (typeof pin !== 'string' || pin.length < 6 || /\s/.test(pin)) {
        return new Response(JSON.stringify({ success: false, error: 'PIN must be at least 6 characters with no spaces' }), {
          status: 400,
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

      securityManager.setPIN(pin);

      // Return redirect so the client can send the user to the admin panel
      return new Response(JSON.stringify({ success: true, redirect: `${adminBase}/` }), {
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }
  }

  // All routes below this point require an authenticated session
  if (!securityManager.verifySession(request, deps.bunServer)) {
    const token = url.searchParams.get('token');
    const destination = token ? `${loginRoute}?token=${encodeURIComponent(token)}` : loginRoute;
    return new Response(null, {
      status: 302,
      headers: { 'Location': destination }
    });
  }

  // Theme preview images
  if (route.startsWith(previewPrefix)) {
    const parts = route.substring(previewPrefix.length).split('/');
    if (parts.length === 2) {
      const [themeId, filename] = parts;
      const response = await handleThemePreview(themeId, filename, request);
      if (response) return response;
    }
    return new Response('Not Found', { status: HTTP_STATUS.NOT_FOUND });
  }

  // GET: available themes list
  if (route === themesRoute && request.method === 'GET') {
    const { scanAvailableThemes } = await import('./theme-system.js');
    const { DEFAULT_THEME_ID } = await import('./embedded-templates.js');
    const themes = scanAvailableThemes();
    const activeThemeId = deps.siteConfig.theme || deps.activeTheme || '.default';
    const defaultThemeId = deps.siteConfig.defaultTheme || DEFAULT_THEME_ID;

    themes.forEach(theme => {
      theme.active    = theme.id === activeThemeId;
      theme.isDefault = theme.id === defaultThemeId;
    });

    return new Response(JSON.stringify(themes), {
      headers: { 'Content-Type': MIME_TYPES.JSON }
    });
  }

  // POST: config updates (theme activation, fallback theme)
  if (route === configRoute) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }

    try {
      const body = await request.json();
      const { key, value } = body;

      const ALLOWED_KEYS = ['theme', 'defaultTheme'];
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return new Response(JSON.stringify({
          success: false,
          error: `Invalid key. Allowed keys: ${ALLOWED_KEYS.join(', ')}`
        }), {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

      if (!value) {
        return new Response(JSON.stringify({ success: false, error: 'value is required' }), {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

      const { setThemeConfig, loadTheme } = await import('./theme-system.js');

      if (key === 'theme') {
        const testTheme = await loadTheme(value);

        if (testTheme.activeTheme !== '.default' && testTheme.validation && !testTheme.validation.valid) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Theme validation failed',
            errors: testTheme.validation.errors,
            warnings: testTheme.validation.warnings
          }), {
            status: HTTP_STATUS.BAD_REQUEST,
            headers: { 'Content-Type': MIME_TYPES.JSON }
          });
        }

        setThemeConfig('theme', value);
        deps.siteConfig = (await import('./utils/taxonomy.js')).getSiteConfig();

        return new Response(JSON.stringify({
          success: true,
          message: `Theme activated: "${value}"`,
          key,
          value,
          warnings: testTheme.validation?.warnings || []
        }), {
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

      if (key === 'defaultTheme') {
        const { EMBEDDED_TEMPLATES } = await import('./embedded-templates.js');
        if (!Object.prototype.hasOwnProperty.call(EMBEDDED_TEMPLATES, value)) {
          return new Response(JSON.stringify({
            success: false,
            error: `"${value}" is not an embedded theme and cannot be used as fallback`
          }), {
            status: HTTP_STATUS.BAD_REQUEST,
            headers: { 'Content-Type': MIME_TYPES.JSON }
          });
        }

        setThemeConfig('defaultTheme', value);
        deps.siteConfig = (await import('./utils/taxonomy.js')).getSiteConfig();

        return new Response(JSON.stringify({
          success: true,
          message: `Fallback theme set to: "${value}"`,
          key,
          value
        }), {
          headers: { 'Content-Type': MIME_TYPES.JSON }
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: HTTP_STATUS.SERVER_ERROR,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }
  }

  // POST: build static site
  if (route === buildRoute && request.method === 'POST') {
    if (deps.isBuildingStatic) {
      return new Response(JSON.stringify({ success: false, error: 'Build already in progress' }), {
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    }

    deps.isBuildingStatic = true;

    try {
      const buildModule = await import('./build.js');
      await buildModule.build();
      return new Response(JSON.stringify({ success: true, message: 'Build complete' }), {
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: HTTP_STATUS.SERVER_ERROR,
        headers: { 'Content-Type': MIME_TYPES.JSON }
      });
    } finally {
      deps.isBuildingStatic = false;
    }
  }

  // POST: clear render cache
  if (route === clearCacheRoute && request.method === 'POST') {
    const itemsFreed = deps.cacheManager.clearAll();

    await deps.preRenderAllContent();
    await deps.preCompressContent();

    return new Response(JSON.stringify({ success: true, freed: itemsFreed }), {
      headers: { 'Content-Type': MIME_TYPES.JSON }
    });
  }

  // GET: admin panel HTML
  if (route === `${adminBase}/` || route === adminBase) {
    const { generateAdminHTML } = await import('./admin-pages.js');
    const adminHtml = generateAdminHTML(deps, adminBase);
    return new Response(adminHtml, {
      headers: securityManager.applySecurityHeaders({ 'Content-Type': MIME_TYPES.HTML })
    });
  }

  return new Response('Not Found', { status: HTTP_STATUS.NOT_FOUND });
}
