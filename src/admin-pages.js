// SPDX-FileCopyrightText: 2026 Teo Costa (THYPRESS <https://thypress.org>)
// SPDX-License-Identifier: MPL-2.0

import {
  adminThemeScript,
  adminCryptoScript,
  adminStatusScript,
  adminMagicLinkScript
} from './admin-utils.js';

// ============================================================================
// SYNTAX HIGHLIGHTING IDENTITY TAGS
// ============================================================================

// Identity tagged template literals — no-ops at runtime, used for editor syntax
// highlighting (CSS/HTML code blocks get proper coloring in most editors that
// support tagged template literal language injection).
const css  = (s, ...v) => s.reduce((r, p, i) => r + (v[i - 1] ?? '') + p);
const html = (s, ...v) => s.reduce((r, p, i) => r + (v[i - 1] ?? '') + p);

// ============================================================================
// CSS CONSTANTS
// ============================================================================

/**
 * Shared CSS styles for THYPRESS system pages (Admin, Login, Errors).
 * Decoupled from the HTML generator for reusability across different interfaces.
 */
export const ADMIN_STYLES = css`
    /* Base palette — pure grayscale */
    :root {
      --bg-light: #ffffff;
      --bg-dark:  #0d0d0d;
      --fg-light: #1a1a1a;
      --fg-dark:  #e6e6e6;
      --accent-light:   #2e2e2e;
      --accent-dark:    #d6d6d6;
      --accent-2-light: #4a4a4a;
      --accent-2-dark:  #b0b0b0;
      --muted-light:    #6b6b6b;
      --muted-2-light:  #9a9a9a;
      --muted-dark:     #9e9e9e;
      --muted-2-dark:   #6f6f6f;
      --border-light:   #e0e0e0;
      --border-dark:    #333333;
      --hover-light:    #f5f5f5;
      --hover-dark:     #1a1a1a;
    }

    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; }
    }

    html[data-theme="light"] {
      color-scheme: light;
      --bg: var(--bg-light);
      --fg: var(--fg-light);
      --accent: var(--accent-light);
      --accent-2: var(--accent-2-light);
      --muted: var(--muted-light);
      --muted-2: var(--muted-2-light);
      --border: var(--border-light);
      --hover: var(--hover-light);
    }

    html[data-theme="dark"] {
      color-scheme: dark;
      --bg: var(--bg-dark);
      --fg: var(--fg-dark);
      --accent: var(--accent-dark);
      --accent-2: var(--accent-2-dark);
      --muted: var(--muted-dark);
      --muted-2: var(--muted-2-dark);
      --border: var(--border-dark);
      --hover: var(--hover-dark);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      background: var(--bg);
      color: var(--fg);
      transition: background-color 0.2s, color 0.2s;
    }

    h1 {
      color: var(--fg);
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    h2 {
      margin-top: 2rem;
      margin-bottom: 0.5rem;
      border-bottom: 2px solid var(--border);
      color: var(--fg);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .session-timer {
      font-size: 0.8rem;
      color: var(--muted);
    }

    #session-countdown {
      font-weight: 600;
      color: var(--fg);
      font-variant-numeric: tabular-nums;
    }

    .theme-toggle {
      background: var(--accent);
      color: var(--bg);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.9rem;
      transition: background-color 0.2s;
    }

    .theme-toggle:hover {
      background: var(--accent-2);
    }

    /* PIN status bar — shown prominently at the top of the admin panel */
    .pin-status-bar {
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
      border: 1px solid var(--border);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .pin-status-bar.pin-ok {
      background: var(--hover);
      color: var(--muted);
    }

    .pin-status-bar.pin-missing {
      background: var(--hover);
      border-color: var(--muted);
      color: var(--fg);
    }

    .pin-setup-link {
      background: var(--accent);
      color: var(--bg);
      padding: 0.3rem 0.75rem;
      border-radius: 4px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85rem;
      transition: background-color 0.2s;
      white-space: nowrap;
    }

    .pin-setup-link:hover {
      background: var(--accent-2);
    }

    .pin-plea {
      width: 100%;
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 0.25rem;
    }

    .stats {
      background: var(--hover);
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      border: 1px solid var(--border);
    }

    .stats p {
      margin: 10px 0;
      color: var(--fg);
    }

    .stats strong {
      color: var(--accent);
    }

    .button {
      display: inline-block;
      padding: 12px 24px;
      background: var(--accent);
      color: var(--bg);
      text-decoration: none;
      border-radius: 4px;
      border: none;
      font-size: 16px;
      cursor: pointer;
      margin: 10px 10px 10px 0;
      font-family: inherit;
      transition: background-color 0.2s;
    }

    .button:hover {
      background: var(--accent-2);
    }

    .button:disabled {
      background: var(--muted-2);
      cursor: not-allowed;
      opacity: 0.5;
    }

    .button-secondary {
      background: var(--muted);
    }

    .button-secondary:hover {
      background: var(--accent-2);
    }

    #status {
      margin: 20px 0;
      padding: 12px;
      border-radius: 4px;
      display: none;
      border: 1px solid var(--border);
    }

    #status.info {
      background: var(--hover);
      color: var(--fg);
      display: block;
    }

    #status.success {
      background: var(--hover);
      color: var(--fg);
      display: block;
    }

    #status.error {
      background: var(--hover);
      color: var(--fg);
      display: block;
      border-color: var(--muted);
    }

    .back {
      color: var(--accent);
      text-decoration: none;
    }

    .back:hover {
      text-decoration: underline;
    }

    .theme-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
      margin: 2rem 0;
    }

    .theme-card {
      border: 2px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      background: var(--bg);
      transition: all 0.2s;
    }

    .theme-card:hover {
      border-color: var(--accent-2);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .theme-card.active {
      border-color: var(--accent);
      background: var(--hover);
    }

    .theme-card.invalid {
      border-color: var(--muted);
      opacity: 0.6;
    }

    .theme-preview {
      width: 100%;
      height: 140px;
      background: var(--hover);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 0.9rem;
      overflow: hidden;
    }

    .theme-preview-img {
      width: 100%;
      height: auto;
      object-fit: cover;
      display: block;
    }

    .theme-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-top: 1.25rem;
      gap: 0.5rem;
    }

    .theme-name {
      font-weight: 600;
      font-size: 1.1rem;
      margin: 0;
      flex: 1;
      color: var(--fg);
    }

    .theme-badges {
      display: flex;
      gap: 0.35rem;
      flex-shrink: 0;
    }

    .theme-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-active   { background: var(--accent);   color: var(--bg); }
    .badge-default  { background: var(--accent-2);  color: var(--bg); }
    .badge-embedded { background: var(--muted);     color: var(--bg); }
    .badge-invalid  { background: var(--muted-2);   color: var(--bg); }

    .theme-meta {
      font-size: 0.85rem;
      color: var(--muted);
      margin: 0.5rem 0;
    }

    .theme-description {
      font-size: 0.9rem;
      color: var(--fg);
      margin: 0.75rem 0;
      line-height: 1.4;
      min-height: 2.8em;
    }

    .theme-actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
    }
`;

/**
 * Login-page-specific CSS additions.
 * Not exported — only used internally by generateLoginHTML.
 */
const LOGIN_STYLES = css`
    .login-container {
      max-width: 400px;
      margin: 10vh auto;
      padding: 2rem;
    }

    .login-card {
      background: var(--hover);
      border: 2px solid var(--border);
      border-radius: 8px;
      padding: 2rem;
    }

    .login-title {
      text-align: center;
      margin-bottom: 0.5rem;
      color: var(--fg);
    }

    .login-subtitle {
      text-align: center;
      margin-bottom: 2rem;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--fg);
      font-weight: 600;
    }

    .form-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-family: inherit;
      font-size: 1.2rem;
      letter-spacing: 0.4em;
      text-align: center;
      background: var(--bg);
      color: var(--fg);
      transition: border-color 0.2s;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .submit-button {
      width: 100%;
      padding: 0.75rem;
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .submit-button:hover:not(:disabled) {
      background: var(--accent-2);
    }

    .submit-button:disabled {
      background: var(--muted);
      cursor: not-allowed;
      opacity: 0.6;
    }

    .status-message {
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 4px;
      text-align: center;
      display: none;
      border: 1px solid var(--border);
      background: var(--hover);
      color: var(--fg);
    }

    .status-message.visible {
      display: block;
    }

    .status-message.error {
      border-color: var(--muted);
    }

    .pow-status {
      margin-top: 0.5rem;
      font-size: 0.85rem;
      color: var(--muted);
      text-align: center;
      min-height: 1.2em;
    }

    .theme-toggle {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
    }
`;

// ============================================================================
// ADMIN PANEL COMPONENTS (internal — not exported)
// ============================================================================

/**
 * Stats dashboard block showing server state at render time.
 * @param {Object} deps - Server dependency object
 * @returns {string} HTML string
 */
const AdminStats = (deps) => `
  <div class="stats">
    <p><strong>Entries:</strong> ${deps.contentCache.size}</p>
    <p><strong>Mode:</strong> ${deps.contentMode}</p>
    <p><strong>Content root:</strong> ${deps.contentRoot}</p>
    <p><strong>Active theme:</strong> ${deps.activeTheme || '.default (embedded)'}</p>
    <p><strong>Fallback theme:</strong> ${deps.siteConfig.defaultTheme || '.default (binary)'}</p>
    <p><strong>Pre-rendered pages:</strong> ${deps.cacheManager.renderedCache.size}</p>
    <p><strong>Pre-compressed:</strong> ${deps.cacheManager.precompressedCache.size / 2} pages × 2 formats</p>
    <p><strong>Images cached:</strong> ${deps.imageReferences.size} files with images</p>
    <p><strong>Redirect rules:</strong> ${deps.redirectRules.size}</p>
    <p><strong>Live reload:</strong> ${deps.liveReloadClients.size} connected clients</p>
  </div>
`;

/**
 * Theme management section container.
 * The theme grid is loaded and rendered entirely client-side after page load.
 * @returns {string} HTML string
 */
const ThemeSection = () => `
  <h2>Theme Management</h2>
  <div id="themes-container">
    <p>Loading themes...</p>
  </div>
`;

/**
 * Build controls section.
 * @returns {string} HTML string
 */
const BuildSection = () => `
  <h2>Build Static Site</h2>
  <p>Generate a complete static build in /build folder for deployment.</p>

  <button id="buildBtn" class="button" onclick="buildSite()">Build Static Site</button>
  <button id="clearCacheBtn" class="button button-secondary" onclick="clearCache()">Clear Cache</button>
`;

/**
 * PIN protection status bar — shown prominently below the page title.
 *
 * If PIN is set:    quiet "protected" indicator.
 * If PIN is NOT set: prominent warning with a direct link to the login/setup page,
 *                    plus a polite plea to set a PIN before exposing the server to
 *                    any network. (The admin can be accessed via magic link without
 *                    a PIN, which is the exact scenario this warns about.)
 *
 * @param {boolean} hasPin - Whether a PIN is currently configured
 * @param {string} adminBase - Dynamic admin base path
 * @returns {string} HTML string
 */
const PinStatus = (hasPin, adminBase) => hasPin
  ? `<div class="pin-status-bar pin-ok">🔒 PIN protection active</div>`
  : `<div class="pin-status-bar pin-missing">
      <span>⚠️ No PIN is set — your admin panel is unprotected.</span>
      <a href="${adminBase}/login" class="pin-setup-link">Set a PIN now →</a>
      <p class="pin-plea">Please set a PIN before exposing this server to any network. Without one, anyone who discovers the admin URL can access and modify your site.</p>
    </div>`;

// ============================================================================
// LOGIN PAGE COMPONENTS (internal — not exported)
// ============================================================================

/**
 * PIN login form (rendered when a PIN is already configured).
 * Supports 4–6 digit PINs.
 * @returns {string} HTML string
 */
const LoginForm = () => `
  <!-- LOGIN FORM -->
  <form id="loginForm">
    <div class="form-group">
      <label for="pin" class="form-label">PIN</label>
      <input
        type="password"
        id="pin"
        class="form-input"
        placeholder="••••••"
        autocomplete="off"
        required
      />
    </div>

    <button type="submit" class="submit-button" id="submitBtn">Login</button>
    <div class="pow-status" id="powStatus"></div>
    <div class="status-message" id="statusMessage"></div>
  </form>
`;

/**
 * First-run PIN setup form (rendered when no PIN exists yet).
 * Supports 4–6 digit PINs.
 * @returns {string} HTML string
 */
const SetupForm = () => `
  <!-- FIRST-RUN PIN SETUP FORM -->
  <form id="setupForm">
    <div class="form-group">
      <label for="newPin" class="form-label">Choose a PIN (min. 6 characters)</label>
      <input
        type="password"
        id="newPin"
        class="form-input"
        placeholder="••••••"
        autocomplete="new-password"
        required
      />
    </div>

    <div class="form-group">
      <label for="confirmPin" class="form-label">Confirm PIN</label>
      <input
        type="password"
        id="confirmPin"
        class="form-input"
        placeholder="••••••"
        autocomplete="new-password"
        required
      />
    </div>

    <button type="submit" class="submit-button" id="setupBtn">Set PIN &amp; Enter</button>
    <div class="status-message" id="statusMessage"></div>
  </form>
`;

// ============================================================================
// ADMIN PANEL CLIENT-SIDE SCRIPTS (internal — not exported)
// ============================================================================

/**
 * Session TTL countdown script.
 * Counts down from 24h (matching the cookie Max-Age and server-side session TTL).
 * The countdown starts from page load — since the session was created some moments
 * before page load, the real remaining time may be fractionally less, but this is an
 * acceptable UX approximation for a "time remaining" display.
 * When the countdown hits zero the page reloads to trigger the server-side redirect to login.
 * @returns {string} JavaScript source code
 */
const sessionCountdownScript = () => `
  // Session TTL countdown: 24h from page load (matches cookie Max-Age and server-side session TTL)
  (function() {
    const SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
    const pageLoadTime = Date.now();

    function pad(n) { return String(n).padStart(2, '0'); }

    function formatRemaining(ms) {
      if (ms <= 0) {
        // Session has likely expired — reload to trigger server-side redirect to login
        window.location.reload();
        return '00:00:00';
      }
      const s = Math.floor(ms / 1000);
      return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    }

    function tick() {
      const remaining = SESSION_MS - (Date.now() - pageLoadTime);
      const el = document.getElementById('session-countdown');
      if (el) el.textContent = formatRemaining(remaining);
    }

    tick();
    setInterval(tick, 1000);
  })();
`;

/**
 * Theme management client-side script.
 * Loads available themes from the API, renders theme cards, and handles
 * theme activation and fallback theme selection.
 * adminBase is baked in at server render time.
 * @param {string} adminBase - Dynamic admin base path
 * @returns {string} JavaScript source code
 */
const adminThemeManagerScript = (adminBase) => `
  let themes = [];

  async function loadThemes() {
    try {
      const response = await fetch('${adminBase}/themes');
      themes = await response.json();
      renderThemes();
    } catch (error) {
      document.getElementById('themes-container').innerHTML =
        '<p style="color: var(--muted);">Failed to load themes: ' + error.message + '</p>';
    }
  }

  function renderThemes() {
    const container = document.getElementById('themes-container');

    if (themes.length === 0) {
      container.innerHTML = '<p>No themes found</p>';
      return;
    }

    container.innerHTML = '<div class="theme-grid">' + themes.map(theme => {
      const activeClass  = theme.active  ? 'active'  : '';
      const invalidClass = !theme.valid  ? 'invalid' : '';
      const canBeDefault = theme.type === 'embedded' || theme.type === 'overridden';

      let previewHtml = '<div class="theme-preview">No preview</div>';
      if (theme.preview) {
        const previewUrl = \`${adminBase}/theme-preview/\${theme.id}/\${theme.preview}\`;
        previewHtml = \`<img src="\${previewUrl}" alt="\${theme.name} preview" class="theme-preview-img" loading="lazy">\`;
      }

      return \`
        <div class="theme-card \${activeClass} \${invalidClass}">
          \${previewHtml}

          <div class="theme-header">
            <h3 class="theme-name">\${theme.name}</h3>
            <div class="theme-badges">
              \${theme.active    ? '<span class="theme-badge badge-active">ACTIVE</span>'     : ''}
              \${theme.isDefault ? '<span class="theme-badge badge-default">FALLBACK</span>'  : ''}
              \${theme.embedded  ? '<span class="theme-badge badge-embedded">EMBEDDED</span>' : ''}
              \${!theme.valid    ? '<span class="theme-badge badge-invalid">INVALID</span>'   : ''}
            </div>
          </div>

          <div class="theme-meta">
            <strong>Version:</strong> \${theme.version} |
            <strong>By:</strong> \${theme.author}
          </div>

          <p class="theme-description">\${theme.description}</p>

          <div class="theme-actions">
            \${!theme.active && theme.valid ? \`
              <button class="button" onclick="activateTheme('\${theme.id}')">
                Activate Theme
              </button>
            \` : ''}
            \${canBeDefault && !theme.isDefault ? \`
              <button class="button button-secondary" onclick="setAsDefault('\${theme.id}')">
                Set as Fallback
              </button>
            \` : ''}
          </div>
        </div>
      \`;
    }).join('') + '</div>';
  }

  async function activateTheme(themeId) {
    setStatus('Validating and activating theme...', 'info');

    try {
      const response = await fetch('${adminBase}/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'theme', value: themeId })
      });

      const data = await response.json();

      if (data.success) {
        setStatus('Theme activated: ' + themeId + '. Reloading...', 'success');
        setTimeout(() => location.reload(), 1000);
      } else {
        setStatus('Failed to activate theme: ' + data.error, 'error');
      }
    } catch (error) {
      setStatus('Failed to activate theme: ' + error.message, 'error');
    }
  }

  async function setAsDefault(themeId) {
    setStatus('Setting fallback theme...', 'info');

    try {
      const response = await fetch('${adminBase}/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'defaultTheme', value: themeId })
      });

      const data = await response.json();

      if (data.success) {
        setStatus('Fallback theme set to: ' + themeId + '. Reloading...', 'success');
        setTimeout(() => location.reload(), 1000);
      } else {
        setStatus('Failed to set fallback: ' + data.error, 'error');
      }
    } catch (error) {
      setStatus('Failed to set fallback: ' + error.message, 'error');
    }
  }

  loadThemes();
`;

/**
 * Build and cache management client-side script.
 * adminBase is baked in at server render time.
 * @param {string} adminBase - Dynamic admin base path
 * @returns {string} JavaScript source code
 */
const adminBuildScript = (adminBase) => `
  async function buildSite() {
    const btn = document.getElementById('buildBtn');
    btn.disabled = true;
    setStatus('Building static site...', 'info');

    try {
      const response = await fetch('${adminBase}/build', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('Build complete! Check the /build folder.', 'success');
      } else {
        setStatus('Build failed: ' + data.error, 'error');
      }
    } catch (error) {
      setStatus('Build failed: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function clearCache() {
    const btn = document.getElementById('clearCacheBtn');
    btn.disabled = true;
    setStatus('Clearing cache...', 'info');

    try {
      const response = await fetch('${adminBase}/clear-cache', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('Cache cleared! Freed ' + data.freed + ' items. Reloading...', 'success');
        setTimeout(() => location.reload(), 1000);
      } else {
        setStatus('Clear cache failed: ' + data.error, 'error');
      }
    } catch (error) {
      setStatus('Clear cache failed: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }
`;

// ============================================================================
// LOGIN PAGE CLIENT-SIDE SCRIPTS (internal — not exported)
// ============================================================================

/**
 * PIN login form submission handler.
 * Validates PIN format (4–6 digits), fetches a PoW challenge, mines the nonce,
 * then submits PIN + nonce to the auth endpoint.
 * adminBase is baked in at server render time.
 * @param {string} adminBase - Dynamic admin base path
 * @returns {string} JavaScript source code
 */
const loginFormScript = (adminBase) => `
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();

    const pin = document.getElementById('pin').value;
    const btn = document.getElementById('submitBtn');
    const pow = document.getElementById('powStatus');

    if (pin.length < 6 || /\\s/.test(pin)) {
      showStatus('PIN must be at least 6 characters with no spaces', true);
      return;
    }

    btn.disabled = true;
    pow.textContent = 'Computing proof of work...';

    try {
      const challengeRes = await fetch('${adminBase}/auth/challenge');
      const { salt } = await challengeRes.json();

      const nonce = await minePoW(salt);
      pow.textContent = '';

      const authRes = await fetch('${adminBase}/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, nonce })
      });

      const result = await authRes.json();

      if (result.success) {
        showStatus('Login successful, redirecting...');
        window.location.href = result.redirect;
      } else {
        showStatus(result.error || 'Authentication failed', true);
        btn.disabled = false;
      }
    } catch (_) {
      showStatus('Network error. Please try again.', true);
      btn.disabled = false;
    }
  });

  document.getElementById('pin').focus();
`;

/**
 * First-run PIN setup form submission handler.
 * Validates PIN format (4–6 digits), confirms match, sends to setup-pin endpoint.
 * adminBase is baked in at server render time.
 * @param {string} adminBase - Dynamic admin base path
 * @returns {string} JavaScript source code
 */
const setupFormScript = (adminBase) => `
  document.getElementById('setupForm').addEventListener('submit', async e => {
    e.preventDefault();

    const pin     = document.getElementById('newPin').value;
    const confirm = document.getElementById('confirmPin').value;
    const btn     = document.getElementById('setupBtn');

    if (pin.length < 6 || /\\s/.test(pin)) {
      showStatus('PIN must be at least 6 characters with no spaces', true);
      return;
    }

    if (pin !== confirm) {
      showStatus('PINs do not match', true);
      return;
    }

    btn.disabled = true;
    showStatus('Saving PIN...');

    try {
      const res = await fetch('${adminBase}/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const result = await res.json();

      if (result.success) {
        showStatus('PIN set. Logging in...');
        window.location.href = result.redirect;
      } else {
        showStatus(result.error || 'Failed to set PIN', true);
        btn.disabled = false;
      }
    } catch (_) {
      showStatus('Network error. Please try again.', true);
      btn.disabled = false;
    }
  });

  document.getElementById('newPin').focus();
`;

// ============================================================================
// PAGE COMPOSERS (exported)
// ============================================================================

/**
 * Generate admin panel HTML.
 * Composes HTML components and client-side script blocks from admin-utils.js utilities.
 * @param {Object} deps        - Server dependencies (contentCache, siteConfig, securityManager, etc.)
 * @param {string} adminBase   - Dynamic admin base path, e.g. /__thypress_a1b2c3d4e5f6
 */
export function generateAdminHTML(deps, adminBase = '/__thypress') {
  const hasPin = deps.securityManager.pin !== null;

  return html`<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>THYPRESS Admin</title>
  <style>${ADMIN_STYLES}</style>
</head>
<body>
  <div class="header">
    <p><a href="/" class="back">← Back to site</a></p>
    <div class="header-right">
      <span class="session-timer">Session: <span id="session-countdown">24:00:00</span></span>
      <button class="theme-toggle" onclick="toggleTheme()">
        Toggle <span id="theme-state">dark</span> theme
      </button>
    </div>
  </div>

  <h1>THYPRESS Admin</h1>

  ${PinStatus(hasPin, adminBase)}
  ${AdminStats(deps)}
  ${ThemeSection()}
  ${BuildSection()}

  <div id="status"></div>

  <script>
    ${adminThemeScript()}
    ${adminStatusScript()}
    ${sessionCountdownScript()}
    ${adminThemeManagerScript(adminBase)}
    ${adminBuildScript(adminBase)}
  </script>
</body>
</html>`;
}

/**
 * Generate login/setup page HTML.
 *
 * Handles three states:
 *   1. Magic link token in URL  → auto-authenticate silently, redirect to admin
 *   2. No PIN set yet           → PIN creation form (set + confirm)
 *   3. PIN already set          → PIN login form with PoW
 *
 * @param {Object} options - { hasPin: boolean, adminBase: string }
 * @returns {string} Complete HTML page
 */
export function generateLoginHTML({ hasPin, adminBase }) {
  return html`<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>THYPRESS Admin - ${hasPin ? 'Login' : 'Setup'}</title>
  <style>
    ${ADMIN_STYLES}
    ${LOGIN_STYLES}
  </style>
</head>
<body>
  <button class="theme-toggle button" onclick="toggleTheme()">
    Toggle <span id="theme-state">dark</span> theme
  </button>

  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">THYPRESS Admin</h1>
      <p class="login-subtitle">${hasPin ? 'Enter your PIN to continue' : 'Set a PIN to protect your admin panel'}</p>
      ${hasPin ? LoginForm() : SetupForm()}
    </div>
  </div>

  <script>
    ${adminThemeScript()}
    ${adminStatusScript()}
    ${adminCryptoScript()}
    ${adminMagicLinkScript(adminBase)}
    ${hasPin ? loginFormScript(adminBase) : setupFormScript(adminBase)}
  </script>
</body>
</html>`;
}
