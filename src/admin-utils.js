// SPDX-FileCopyrightText: 2026 Teo Costa (THYPRESS <https://thypress.org>)
// SPDX-License-Identifier: MPL-2.0

/**
 * admin-utils.js — Client-side JavaScript utility producers for THYPRESS admin pages.
 *
 * Every export is a function that returns a STRING of JavaScript source code.
 * Nothing in this file executes any logic itself — these are template literal
 * producers whose output is embedded into HTML pages via admin-pages.js.
 *
 * No imports needed — this file has zero dependencies.
 */

// ============================================================================
// THEME
// ============================================================================

/**
 * Returns the client-side theme toggle script used by both admin panel and login page.
 * - toggleTheme() — switches theme and persists to localStorage
 * - updateThemeIcon(theme) — updates #theme-state text content
 * - initTheme() — reads saved preference or system preference on load
 * Reads/writes localStorage key `thypress-theme`.
 * Updates `data-theme` attribute on `<html>`.
 * @returns {string} JavaScript source code
 */
export function adminThemeScript() {
  return `
    function toggleTheme() {
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('thypress-theme', newTheme);
      updateThemeIcon(newTheme);
    }

    function updateThemeIcon(theme) {
      document.getElementById('theme-state').textContent = theme === 'light' ? 'dark' : 'light';
    }

    function initTheme() {
      const saved = localStorage.getItem('thypress-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
      updateThemeIcon(theme);
    }

    initTheme();
  `;
}

// ============================================================================
// CRYPTO / PROOF-OF-WORK
// ============================================================================

/**
 * Returns the client-side SHA-256 implementation and non-blocking Proof-of-Work miner.
 *
 * IMPORTANT: Keep SHA-256 synchronous — async crypto.subtle adds per-iteration overhead
 * that defeats the purpose of a tight mining loop. Cooperative yielding via setTimeout
 * keeps the browser responsive without sacrificing throughput.
 *
 * POW_DIFFICULTY is a clearly-labeled constant at the top so it can be changed trivially.
 * MUST match SecurityManager.POW_DIFFICULTY on the server side.
 *
 * @returns {string} JavaScript source code
 */
export function adminCryptoScript() {
  return `
    const POW_DIFFICULTY = '00000'; // Number of leading hex zeros required (must match server SecurityManager.POW_DIFFICULTY)

    function rightRotate(n, d) {
      return (n >>> d) | (n << (32 - d));
    }

    function sha256(str) {
      const H = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
      ];
      const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
      ];

      const msg = unescape(encodeURIComponent(str));
      const msgLen = msg.length;
      const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
      const padded = new Uint8Array(paddedLen);

      for (let i = 0; i < msgLen; i++) padded[i] = msg.charCodeAt(i);
      padded[msgLen] = 0x80;

      const bitLen = msgLen * 8;
      padded[paddedLen - 4] = (bitLen >>> 24) & 0xff;
      padded[paddedLen - 3] = (bitLen >>> 16) & 0xff;
      padded[paddedLen - 2] = (bitLen >>> 8)  & 0xff;
      padded[paddedLen - 1] =  bitLen         & 0xff;

      for (let cs = 0; cs < paddedLen; cs += 64) {
        const W = new Uint32Array(64);
        for (let i = 0; i < 16; i++) {
          const o = cs + i * 4;
          W[i] = (padded[o] << 24) | (padded[o+1] << 16) | (padded[o+2] << 8) | padded[o+3];
        }
        for (let i = 16; i < 64; i++) {
          const s0 = rightRotate(W[i-15], 7)  ^ rightRotate(W[i-15], 18) ^ (W[i-15] >>> 3);
          const s1 = rightRotate(W[i-2],  17) ^ rightRotate(W[i-2],  19) ^ (W[i-2]  >>> 10);
          W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, h] = H;

        for (let i = 0; i < 64; i++) {
          const S1   = rightRotate(e, 6)  ^ rightRotate(e, 11) ^ rightRotate(e, 25);
          const ch   = (e & f) ^ (~e & g);
          const t1   = (h + S1 + ch + K[i] + W[i]) >>> 0;
          const S0   = rightRotate(a, 2)  ^ rightRotate(a, 13) ^ rightRotate(a, 22);
          const maj  = (a & b) ^ (a & c)  ^ (b & c);
          const t2   = (S0 + maj) >>> 0;
          h = g; g = f; f = e; e = (d + t1) >>> 0;
          d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }

        H[0] = (H[0]+a) >>> 0; H[1] = (H[1]+b) >>> 0;
        H[2] = (H[2]+c) >>> 0; H[3] = (H[3]+d) >>> 0;
        H[4] = (H[4]+e) >>> 0; H[5] = (H[5]+f) >>> 0;
        H[6] = (H[6]+g) >>> 0; H[7] = (H[7]+h) >>> 0;
      }

      return H.map(h => h.toString(16).padStart(8, '0')).join('');
    }

    // Non-blocking miner: yields to the browser event loop every 50ms via setTimeout
    // cooperative yielding. This keeps the UI responsive (status updates visible)
    // without sacrificing throughput — the key insight being that async crypto.subtle
    // would add per-hash overhead inside the loop, so we keep the hash sync and only
    // yield at the outer scheduling level.
    function minePoW(salt) {
      return new Promise(resolve => {
        let nonce = 0;

        function tick() {
          const deadline = Date.now() + 50;

          while (Date.now() < deadline) {
            if (sha256(salt + nonce).startsWith(POW_DIFFICULTY)) {
              return resolve(nonce.toString());
            }
            nonce++;
          }

          if (nonce % 10000 === 0) {
            const el = document.getElementById('powStatus');
            if (el) el.textContent = 'Computing... (' + nonce + ' attempts)';
          }

          setTimeout(tick, 0);
        }

        tick();
      });
    }
  `;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Returns shared UI status helper functions used across admin pages.
 * Note: these target different element IDs because they serve different pages.
 *   setStatus  → #status       (admin panel)
 *   showStatus → #statusMessage (login page)
 * Both are included here since both pages pull from this module.
 * @returns {string} JavaScript source code
 */
export function adminStatusScript() {
  return `
    // Used by the admin panel — targets the #status element
    function setStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = type;
    }

    // Used by the login page — targets the #statusMessage element
    function showStatus(msg, isError = false) {
      const el = document.getElementById('statusMessage');
      el.textContent = msg;
      el.className = 'status-message visible' + (isError ? ' error' : '');
    }
  `;
}

// ============================================================================
// MAGIC LINK
// ============================================================================

/**
 * Returns the magic link auto-authentication IIFE.
 * - Checks URL for ?token= parameter
 * - Strips token from URL bar immediately via history.replaceState (before any async work)
 * - POSTs token to ${adminBase}/auth
 * - Redirects on success, falls through silently on failure
 *
 * Silent failure is intentional: if the token is expired or already used,
 * the user just sees the normal PIN login form — they are not locked out.
 *
 * @param {string} adminBase - Dynamic admin base path, baked into the fetch URL at render time
 * @returns {string} JavaScript source code
 */
export function adminMagicLinkScript(adminBase) {
  return `
    // Magic link auto-authentication
    // If the URL contains ?token=... consume it immediately, then wipe it from the URL bar.
    (async function handleMagicLink() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (!token) return;

      // Wipe token from URL bar immediately (before any async work)
      window.history.replaceState({}, document.title, window.location.pathname);

      try {
        const res = await fetch(${JSON.stringify(adminBase)} + '/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const data = await res.json();

        if (data.success) {
          window.location.href = data.redirect;
        }
        // If token already consumed or invalid, fall through silently —
        // user sees the normal PIN login form.
      } catch (_) {
        // Network error — fall through to normal login form
      }
    })();
  `;
}
