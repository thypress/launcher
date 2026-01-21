// Copyright (C) 2026 THYPRESS

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org>.

import fsSync from 'fs';
import { watch } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import zlib from 'zlib';
import { promisify } from 'util';
import {
  loadAllContent,
  loadTheme,
  buildNavigationTree,
  getSiteConfig,
  processContentFile,
  normalizeToWebPath
} from './renderer.js';
import { optimizeToCache, CACHE_DIR } from './build.js';
import { success, error as errorMsg, warning, info, dim, bright } from './utils/colors.js';
import { CacheManager, metrics } from './cache.js';
import { handleRequest } from './routes.js';

const START_PORT = 3009;
const MAX_PORT_TRIES = 100;
const DEBOUNCE_DELAY = 500;
const VALID_REDIRECT_CODES = [301, 302, 303, 307, 308];
const DEFAULT_REDIRECT_STATUS = 301;

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

// Live reload clients
const liveReloadClients = new Set();

// State
let contentCache = new Map();
let slugMap = new Map();
let navigation = [];
let templatesCache = new Map();
let themeAssets = new Map();
let activeTheme = null;
let siteConfig = getSiteConfig();
let imageReferences = new Map();
let brokenImages = [];
let contentMode = 'structured';
let contentRoot = '';
let redirectRules = new Map();
let isBuildingStatic = false;
let isOptimizingImages = false;
let optimizeDebounceTimer = null;

const cacheManager = new CacheManager();

function shouldIgnore(name) {
  return name.startsWith('.');
}

function isInDraftsFolder(filename) {
  const parts = filename.split(path.sep);
  return parts.includes('drafts');
}

function loadRedirects() {
  const redirectsPath = path.join(process.cwd(), 'redirects.json');

  if (!fsSync.existsSync(redirectsPath)) {
    return;
  }

  try {
    const redirectsData = JSON.parse(fsSync.readFileSync(redirectsPath, 'utf-8'));
    redirectRules = new Map();

    for (const [from, toData] of Object.entries(redirectsData)) {
      if (from.startsWith('_')) continue;

      let to, statusCode;

      if (typeof toData === 'string') {
        to = toData;
        statusCode = DEFAULT_REDIRECT_STATUS;
      } else if (typeof toData === 'object' && toData.to) {
        to = toData.to;
        statusCode = toData.statusCode || DEFAULT_REDIRECT_STATUS;
      } else {
        console.log(warning(`Invalid redirect rule for "${from}", skipping`));
        continue;
      }

      if (!VALID_REDIRECT_CODES.includes(statusCode)) {
        console.log(warning(`Invalid status code ${statusCode} for "${from}", using ${DEFAULT_REDIRECT_STATUS}`));
        statusCode = DEFAULT_REDIRECT_STATUS;
      }

      redirectRules.set(from, { to, statusCode });
    }

    if (redirectRules.size > 0) {
      console.log(success(`Loaded ${redirectRules.size} redirect rules`));

      const statusBreakdown = Array.from(redirectRules.values()).reduce((acc, rule) => {
        acc[rule.statusCode] = (acc[rule.statusCode] || 0) + 1;
        return acc;
      }, {});

      console.log(dim(`  Status codes: ${Object.entries(statusBreakdown).map(([code, count]) => `${count}×${code}`).join(', ')}`));
    }

  } catch (error) {
    console.error(errorMsg(`Failed to load redirects: ${error.message}`));
  }
}

function broadcastReload() {
  liveReloadClients.forEach(ws => {
    try {
      ws.send('reload');
    } catch (error) {
      liveReloadClients.delete(ws);
    }
  });
}

async function preRenderAllContent() {
  console.log(info('Pre-rendering all pages...'));

  cacheManager.renderedCache.clear();

  for (const [slug, entry] of contentCache) {
    try {
      if (entry.type === 'html' && entry.renderedHtml !== null) {
        cacheManager.renderedCache.set(slug, entry.renderedHtml);
      } else {
        const { renderEntry } = await import('./renderer.js');
        const html = renderEntry(entry, slug, templatesCache, navigation, siteConfig, contentCache);
        cacheManager.renderedCache.set(slug, html);
      }
    } catch (error) {
      console.error(errorMsg(`Failed to pre-render ${slug}: ${error.message}`));
    }
  }

  const { renderEntryList, renderTagPage, renderCategoryPage, renderSeriesPage, getAllTags, getAllCategories, getAllSeries, slugify, POSTS_PER_PAGE } = await import('./renderer.js');

  const totalPages = Math.ceil(contentCache.size / POSTS_PER_PAGE);
  for (let page = 1; page <= totalPages; page++) {
    try {
      const html = renderEntryList(contentCache, page, templatesCache, navigation, siteConfig);
      cacheManager.renderedCache.set(`__index_${page}`, html);
    } catch (error) {
      console.error(errorMsg(`Failed to pre-render page ${page}: ${error.message}`));
    }
  }

  const allTags = getAllTags(contentCache);
  for (const tag of allTags) {
    try {
      const html = renderTagPage(contentCache, tag, templatesCache, navigation);
      cacheManager.renderedCache.set(`__tag_${tag}`, html);
    } catch (error) {
      console.error(errorMsg(`Failed to pre-render tag ${tag}: ${error.message}`));
    }
  }

  const allCategories = getAllCategories(contentCache);
  for (const category of allCategories) {
    try {
      const html = renderCategoryPage(contentCache, category, templatesCache, navigation);
      cacheManager.renderedCache.set(`__category_${category}`, html);
    } catch (error) {
      console.error(errorMsg(`Failed to pre-render category ${category}: ${error.message}`));
    }
  }

  const allSeries = getAllSeries(contentCache);
  for (const series of allSeries) {
    try {
      const html = renderSeriesPage(contentCache, series, templatesCache, navigation);
      cacheManager.renderedCache.set(`__series_${slugify(series)}`, html);
    } catch (error) {
      console.error(errorMsg(`Failed to pre-render series ${series}: ${error.message}`));
    }
  }

  console.log(success(`Pre-rendered ${cacheManager.renderedCache.size} pages`));
}

async function preCompressContent() {
  console.log(info('Pre-compressing content...'));

  cacheManager.precompressedCache.clear();

  for (const [slug, html] of cacheManager.renderedCache) {
    const buffer = Buffer.from(html);
    const etag = cacheManager.generateETag(buffer);

    try {
      const gzipped = await gzip(buffer);
      cacheManager.precompressedCache.set(`${slug}:gzip`, {
        content: gzipped,
        encoding: 'gzip',
        etag: etag
      });

      const brotlied = await brotliCompress(buffer);
      cacheManager.precompressedCache.set(`${slug}:br`, {
        content: brotlied,
        encoding: 'br',
        etag: etag
      });
    } catch (error) {
      console.error(errorMsg(`Failed to compress ${slug}: ${error.message}`));
    }
  }

  console.log(success(`Pre-compressed ${cacheManager.renderedCache.size} pages (${cacheManager.precompressedCache.size / 2} × 2 formats)`));
}

async function reloadContent() {
  const result = loadAllContent();
  contentCache = result.contentCache;
  slugMap = result.slugMap;
  navigation = result.navigation;
  imageReferences = result.imageReferences;
  brokenImages = result.brokenImages;
  contentMode = result.mode;
  contentRoot = result.contentRoot;

  invalidateDynamicCaches();

  await preRenderAllContent();
  await preCompressContent();

  scheduleImageOptimization();
  broadcastReload();
}

function invalidateDynamicCaches() {
  cacheManager.dynamicContentCache.delete('search.json');
  cacheManager.dynamicContentCache.delete('rss.xml');
  cacheManager.dynamicContentCache.delete('sitemap.xml');
  console.log(dim('[Cache] Invalidated dynamic content caches'));
}

const imageOptimizationQueue = new Set();
function scheduleImageOptimization() {
  imageOptimizationQueue.add(Date.now());

  clearTimeout(optimizeDebounceTimer);
  optimizeDebounceTimer = setTimeout(async () => {
    if (!isOptimizingImages && imageOptimizationQueue.size > 0) {
      imageOptimizationQueue.clear();
      isOptimizingImages = true;
      await optimizeToCache(imageReferences, brokenImages);
      isOptimizingImages = false;
    }
  }, DEBOUNCE_DELAY);
}

async function reloadTheme() {
  const config = getSiteConfig();

  try {
    console.log(info(`Loading theme: ${config.theme || 'auto-detect'}...`));

    const newTheme = await loadTheme(config.theme, config);

    if (newTheme.activeTheme && newTheme.activeTheme !== '.default' && newTheme.validation && !newTheme.validation.valid) {
      console.log('');
      console.error(errorMsg(`✗ Theme "${newTheme.activeTheme}" validation failed`));
      console.log('');

      if (newTheme.validation.errors.length > 0) {
        console.log(errorMsg('Errors:'));
        newTheme.validation.errors.forEach(err => {
          console.log(dim(`  • ${err}`));
        });
        console.log('');
      }

      if (newTheme.validation.warnings.length > 0) {
        console.log(warning('Warnings:'));
        newTheme.validation.warnings.forEach(warn => {
          console.log(dim(`  • ${warn}`));
        });
        console.log('');
      }

      if (config.forceTheme !== true) {
        console.log(info('Fix:'));
        console.log(dim('  1. Fix the errors listed above'));
        console.log(dim('  2. Set forceTheme: true in config.json (not recommended)'));
        console.log(dim('  3. Switch to a different theme in config.json'));
        console.log('');
        console.log(warning('  Keeping previous working theme loaded'));
        return;
      } else {
        console.log('');
        console.log(warning('  forceTheme enabled - loading broken theme anyway'));
        console.log(warning('Pages may fail to render or show errors'));
        console.log('');
      }
    }

    if (newTheme.validation && newTheme.validation.warnings.length > 0) {
      console.log(warning(`Theme "${newTheme.activeTheme}" has warnings:`));
      newTheme.validation.warnings.forEach(warn => {
        console.log(dim(`  • ${warn}`));
      });
      console.log('');
    }

    templatesCache = newTheme.templatesCache;
    themeAssets = newTheme.themeAssets;
    activeTheme = newTheme.activeTheme;

    cacheManager.dynamicContentCache.delete('404.html');

    await preRenderAllContent();
    await preCompressContent();

    console.log(success(`✓ Theme "${activeTheme}" loaded successfully`));
    broadcastReload();

  } catch (error) {
    console.log('');
    console.error(errorMsg(`Failed to reload theme: ${error.message}`));
    console.log(warning('  Keeping previous theme loaded'));
    console.log('');
  }
}

function loadSingleContent(filename) {
  const webPath = normalizeToWebPath(filename);
  if (!/\.(md|txt|html)$/i.test(webPath)) return;

  try {
    const fullPath = path.join(contentRoot, filename);
    const result = processContentFile(fullPath, filename, contentMode, contentRoot, siteConfig);

    if (!result) {
      console.log(dim(`Skipped draft: ${path.basename(filename)}`));
      return;
    }

    contentCache.set(result.slug, result.entry);
    slugMap.set(webPath, result.slug);

    if (result.imageReferences.length > 0) {
      imageReferences.set(webPath, result.imageReferences);
    }

    console.log(success(`Entry '${path.basename(filename)}' loaded`));
    invalidateDynamicCaches();
  } catch (error) {
    console.error(errorMsg(`Error loading '${path.basename(filename)}': ${error.message}`));
  }
}

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' :
                'xdg-open';

  exec(`${start} ${url}`, (error) => {
    if (error) {
      console.log(info(`Server running at ${url} (could not auto-open browser)`));
    }
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + MAX_PORT_TRIES; port++) {
    try {
      const testServer = Bun.serve({
        port,
        fetch() {
          return new Response('test');
        }
      });
      testServer.stop();
      return port;
    } catch (error) {
      continue;
    }
  }
  throw new Error('No available port');
}

// Initialize
console.log(bright('Initializing server...\n'));

const initialLoad = loadAllContent();
contentCache = initialLoad.contentCache;
slugMap = initialLoad.slugMap;
navigation = initialLoad.navigation;
imageReferences = initialLoad.imageReferences;
brokenImages = initialLoad.brokenImages;
contentMode = initialLoad.mode;
contentRoot = initialLoad.contentRoot;

siteConfig = getSiteConfig();

await reloadTheme();

if (!templatesCache.has('index')) {
  console.log('');
  console.error(errorMsg('FATAL: Missing required template: index.html'));
  console.log('');
  console.log(info('The active theme must provide index.html'));
  console.log(dim('Fix:'));
  console.log(dim('  1. Add index.html to your theme'));
  console.log(dim('  2. Switch theme in config.json'));
  console.log(dim('  3. Set theme: ".default" to use embedded theme'));
  console.log('');
  process.exit(1);
}

if (!templatesCache.has('entry')) {
  console.log('');
  console.error(errorMsg('FATAL: Missing required template: entry.html'));
  console.log('');
  console.log(info('The active theme must provide entry.html'));
  console.log(dim('Fix:'));
  console.log(dim('  1. Add entry.html to your theme'));
  console.log(dim('  2. Switch theme in config.json'));
  console.log(dim('  3. Set theme: ".default" to use embedded theme'));
  console.log('');
  process.exit(1);
}

console.log(success('✓ Theme validation passed'));

loadRedirects();

if (!isOptimizingImages && imageReferences.size > 0) {
  isOptimizingImages = true;
  await optimizeToCache(imageReferences, brokenImages);
  isOptimizingImages = false;
}

// Watch content directory
try {
  watch(contentRoot, { recursive: true }, async (event, filename) => {
    if (!filename) return;

    if (shouldIgnore(path.basename(filename))) return;

    if (isInDraftsFolder(filename)) return;

    const webPath = normalizeToWebPath(filename);

    try {
      if (/\.(md|txt|html)$/i.test(webPath)) {
        console.log(info(`Content: ${event} - ${path.basename(filename)}`));

        if (event === 'rename') {
          const fullPath = path.join(contentRoot, filename);

          if (fsSync.existsSync(fullPath)) {
            loadSingleContent(filename);
            navigation = buildNavigationTree(contentRoot, contentCache, contentMode);
            await preRenderAllContent();
            await preCompressContent();
            const result = loadAllContent();
            imageReferences = result.imageReferences;
            scheduleImageOptimization();
          } else {
            const slug = slugMap.get(webPath);
            if (slug) {
              contentCache.delete(slug);
              slugMap.delete(webPath);
              imageReferences.delete(webPath);
              cacheManager.renderedCache.delete(slug);
              cacheManager.precompressedCache.delete(`${slug}:gzip`);
              cacheManager.precompressedCache.delete(`${slug}:br`);
              console.log(success(`Entry '${path.basename(filename)}' removed from cache`));
              navigation = buildNavigationTree(contentRoot, contentCache, contentMode);
            }
          }
        } else if (event === 'change') {
          loadSingleContent(filename);
          navigation = buildNavigationTree(contentRoot, contentCache, contentMode);
          await preRenderAllContent();
          await preCompressContent();
          scheduleImageOptimization();
        }
      }

      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
        console.log(info(`Images: ${event} - ${path.basename(filename)}`));
        scheduleImageOptimization();
      }
    } catch (error) {
      console.error(errorMsg(`Error processing change: ${error.message}`));
    }
  });
  console.log(success(`Watching ${contentRoot} for changes`));
} catch (error) {
  console.error(errorMsg(`Could not watch content directory: ${error.message}`));
}

// Watch theme directory
try {
  const themesDir = path.join(process.cwd(), 'templates');
  if (fsSync.existsSync(themesDir)) {
    watch(themesDir, { recursive: true }, async (event, filename) => {
      if (!filename) return;

      if (shouldIgnore(path.basename(filename))) return;

      console.log(info(`Theme: ${event} - ${filename}`));
      await reloadTheme();
    });
    console.log(success('Watching templates/ for changes'));
  }
} catch (error) {}

// Watch config and redirects
try {
  const configPath = path.join(process.cwd(), 'config.json');
  if (fsSync.existsSync(configPath)) {
    watch(configPath, async (event, filename) => {
      siteConfig = getSiteConfig();
      await reloadTheme();
      invalidateDynamicCaches();
      console.log(success('Config reloaded'));
      broadcastReload();
    });
  }

  const redirectsPath = path.join(process.cwd(), 'redirects.json');
  if (fsSync.existsSync(redirectsPath)) {
    watch(redirectsPath, async (event, filename) => {
      loadRedirects();
      console.log(success('Redirects reloaded'));
    });
  }
} catch (error) {}

// Metrics interval
setInterval(() => {
  if (metrics.requests > 0) {
    const totalCacheHits = metrics.httpCacheHits + metrics.serverCacheHits;
    const totalAttempts = totalCacheHits + metrics.serverRenderHits;
    const hitRate = totalAttempts > 0 ? ((totalCacheHits / totalAttempts) * 100).toFixed(1) : '0.0';
    const avgTime = metrics.responseTimes.length > 0
      ? (metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length).toFixed(2)
      : '0.00';

    console.log(dim(`[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${metrics.requests} req/10s | Avg: ${avgTime}ms | Cache: ${hitRate}% (HTTP304: ${metrics.httpCacheHits}, Cached: ${metrics.serverCacheHits}, Rendered: ${metrics.serverRenderHits})`));
  }
  metrics.requests = 0;
  metrics.httpCacheHits = 0;
  metrics.serverCacheHits = 0;
  metrics.serverRenderHits = 0;
  metrics.responseTimes = [];
}, 10000);

// Start server
let port;

if (process.env.PORT) {
  port = parseInt(process.env.PORT, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(errorMsg(`Invalid PORT value: ${process.env.PORT}`));
    console.log(dim('PORT must be a number between 1-65535'));
    process.exit(1);
  }

  try {
    const testServer = Bun.serve({
      port,
      fetch() { return new Response('test'); }
    });
    testServer.stop();
    console.log(info(`Using PORT from environment: ${port}`));
  } catch (error) {
    console.error(errorMsg(`Port ${port} is already in use`));
    console.log(info('Remove PORT env var to auto-detect available port'));
    process.exit(1);
  }
} else {
  port = await findAvailablePort(START_PORT);

  if (port !== START_PORT) {
    console.log(info(`Port ${START_PORT} in use, using ${port} instead\n`));
  }
}

Bun.serve({
  port,
  async fetch(request, server) {
    const startTime = Date.now();

    try {
      metrics.requests++;

      const deps = {
        contentCache,
        slugMap,
        navigation,
        templatesCache,
        themeAssets,
        activeTheme,
        siteConfig,
        imageReferences,
        brokenImages,
        contentMode,
        contentRoot,
        redirectRules,
        cacheManager,
        metrics,
        isBuildingStatic,
        liveReloadClients,
        preRenderAllContent,
        preCompressContent
      };

      return await handleRequest(request, server, deps);
    } catch (error) {
      console.error(errorMsg(`Request error: ${error.message}`));
      return new Response('Internal Server Error', { status: 500 });
    } finally {
      const responseTime = Date.now() - startTime;
      metrics.responseTimes.push(responseTime);
    }
  },

  websocket: {
    open(ws) {
      liveReloadClients.add(ws);
    },
    close(ws) {
      liveReloadClients.delete(ws);
    },
    message(ws, message) {
      // Currently unused, but log if we receive unexpected messages
      if (message !== 'ping') {
        console.log(info(`Unexpected WebSocket message: ${message}`));
      }
    }
  }
});

const serverUrl = `http://localhost:${port}`;

console.log(bright(`
• Server running on ${serverUrl}
• Content mode: ${contentMode}
• Content root: ${contentRoot}
• Active theme: ${activeTheme || '.default (embedded)'}
• Pre-rendered: ${cacheManager.renderedCache.size} pages
• Pre-compressed: ${cacheManager.precompressedCache.size / 2} pages × 2 formats
• Live reload: enabled
• Redirects: ${redirectRules.size} rules
• Admin panel: ${serverUrl}/__thypress/
`));

const shouldOpenBrowser = process.env.THYPRESS_OPEN_BROWSER === 'true';
if (shouldOpenBrowser) {
  console.log(info('Opening browser...\n'));
  openBrowser(serverUrl);
}
