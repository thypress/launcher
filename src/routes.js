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

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  renderEntry,
  renderEntryList,
  renderTagPage,
  renderCategoryPage,
  renderSeriesPage,
  generateRSS,
  generateSitemap,
  generateSearchIndex,
  getAllTags,
  getAllCategories,
  getAllSeries,
  slugify
} from './renderer.js';
import { loadEmbeddedTemplates } from './theme-system.js';
import { CACHE_DIR } from './build.js';

function getMimeType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const types = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'webp': 'image/webp',
    'xml': 'application/xml; charset=utf-8',
    'txt': 'text/plain; charset=utf-8'
  };
  return types[ext] || 'application/octet-stream';
}

function injectLiveReloadScript(html) {
  const script = `
<script>
(function() {
  const ws = new WebSocket('ws://' + location.host + '/__live_reload');
  ws.onmessage = function(e) {
    if (e.data === 'reload') {
      console.log('[THYPRESS] Reloading page...');
      location.reload();
    }
  };
  ws.onerror = function() {
    console.log('[THYPRESS] Live reload disconnected');
  };
})();
</script>
</body>`;
  return html.replace('</body>', script);
}

export async function handleRequest(request, server, deps) {
  const url = new URL(request.url);
  const route = url.pathname;

  // WebSocket upgrade for live reload
  if (route === '/__live_reload') {
    try {
      if (server.upgrade(request)) {
        return;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    } catch (error) {
      console.error(errorMsg(`WebSocket error: ${error.message}`));
      return new Response('WebSocket error', { status: 500 });
    }
  }

  // Admin API routes
  if (route.startsWith('/__thypress/')) {
    return handleAdmin(request, deps);
  }

  // Theme-root asset passthrough
  if (deps.activeTheme && route !== '/' && !route.startsWith('/__thypress/')) {
    const response = await handleThemeRootAssets(route, request, deps);
    if (response) return response;
  }

  // Redirect handling
  const redirectMatch = matchRedirect(route, deps.redirectRules);
  if (redirectMatch) {
    const redirectUrl = redirectMatch.to.startsWith('http://') || redirectMatch.to.startsWith('https://')
      ? redirectMatch.to
      : new URL(redirectMatch.to, url.origin).toString();

    deps.metrics.serverCacheHits++;
    return Response.redirect(redirectUrl, redirectMatch.statusCode);
  }

  // Optimized images
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(route)) {
    const response = await handleImages(route, request, deps);
    if (response) return response;
  }

  // Theme assets
  if (route.startsWith('/assets/')) {
    return handleAssets(route, request, deps);
  }

  // Meta files
  if (['/search.json', '/rss.xml', '/sitemap.xml', '/robots.txt', '/llms.txt'].includes(route)) {
    return handleMeta(route, request, deps);
  }

  // Tag pages
  if (route.startsWith('/tag/')) {
    const tag = route.substring(5).replace(/\/$/, '');
    return handleTagPage(tag, request, deps);
  }

  // Category pages
  if (route.startsWith('/category/')) {
    const category = route.substring(10).replace(/\/$/, '');
    return handleCategoryPage(category, request, deps);
  }

  // Series pages
  if (route.startsWith('/series/')) {
    const seriesSlug = route.substring(8).replace(/\/$/, '');
    return handleSeriesPage(seriesSlug, request, deps);
  }

  // Pagination
  if (route.startsWith('/page/')) {
    const pageMatch = route.match(/^\/page\/(\d+)\/?$/);
    if (pageMatch) {
      const page = parseInt(pageMatch[1], 10);
      return handlePagination(page, request, deps);
    }
  }

  // Homepage
  if (route === '/') {
    return handleHomepage(request, deps);
  }

  // Entry pages
  const slug = route.substring(1).replace(/\/$/, '');
  const entry = deps.contentCache.get(slug);

  if (entry) {
    return handleEntryPage(entry, slug, request, deps);
  }

  // Try static file from content/
  const staticFilePath = path.join(deps.contentRoot, route.substring(1));
  if (fsSync.existsSync(staticFilePath) && fsSync.statSync(staticFilePath).isFile()) {
    try {
      const fileContent = await fs.readFile(staticFilePath);
      const mimeType = getMimeType(staticFilePath);
      deps.metrics.serverCacheHits++;
      return deps.cacheManager.serveWithCache(fileContent, mimeType, request);
    } catch (error) {}
  }

  // 404
  return handle404(request, deps);
}

async function handleThemeRootAssets(route, request, { activeTheme, contentRoot, metrics, cacheManager }) {
  const themePath = path.join(process.cwd(), 'templates', activeTheme);
  const requestedFile = path.join(themePath, route.substring(1));

  try {
    if (fsSync.existsSync(requestedFile) && fsSync.statSync(requestedFile).isFile()) {
      const ext = path.extname(requestedFile).toLowerCase();

      if (ext === '.html') {
        return null; // Let normal routing handle templates
      }

      const content = await fs.readFile(requestedFile);
      const mimeType = getMimeType(requestedFile);

      metrics.serverCacheHits++;
      return cacheManager.serveWithCache(content, mimeType, request);
    }
  } catch (error) {}

  return null;
}

function matchRedirect(requestPath, redirectRules) {
  if (redirectRules.has(requestPath)) {
    return redirectRules.get(requestPath);
  }

  for (const [from, redirect] of redirectRules) {
    if (!from.includes(':')) continue;

    const pattern = from.replace(/:\w+/g, '([^/]+)');
    const regex = new RegExp(`^${pattern}$`);
    const match = requestPath.match(regex);

    if (match) {
      let destination = redirect.to;
      const params = from.match(/:\w+/g) || [];

      params.forEach((param, i) => {
        destination = destination.replace(param, match[i + 1]);
      });

      return {
        to: destination,
        statusCode: redirect.statusCode
      };
    }
  }

  return null;
}

async function handleImages(route, request, { metrics, cacheManager }) {
  const imagePath = route.substring(1);
  const cachedPath = path.join(CACHE_DIR, imagePath);

  try {
    const cacheKey = `image:${cachedPath}`;
    if (cacheManager.staticAssetCache.has(cacheKey)) {
      metrics.httpCacheHits++;
      const cached = cacheManager.staticAssetCache.get(cacheKey);
      return cacheManager.serveWithCache(cached.content, cached.mimeType, request);
    }

    if (fsSync.existsSync(cachedPath)) {
      const fileContent = await fs.readFile(cachedPath);
      const mimeType = getMimeType(cachedPath);

      cacheManager.addStaticAsset(cacheKey, fileContent, mimeType);

      metrics.serverCacheHits++;
      return cacheManager.serveWithCache(fileContent, mimeType, request);
    }
  } catch (error) {}

  return null;
}

async function handleAssets(route, request, { themeAssets, siteConfig, metrics, cacheManager }) {
  const assetPath = route.substring(8);

  if (themeAssets.has(assetPath)) {
    const asset = themeAssets.get(assetPath);

    if (asset.type === 'template') {
      const rendered = asset.compiled({
        siteUrl: siteConfig.url || 'https://example.com',
        siteTitle: siteConfig.title || 'My Site',
        ...siteConfig,
        ...siteConfig.theme
      });
      metrics.serverRenderHits++;
      return cacheManager.serveWithCache(rendered, getMimeType(assetPath), request);
    } else {
      metrics.serverCacheHits++;
      return cacheManager.serveWithCache(asset.content, getMimeType(assetPath), request);
    }
  }

  const EMBEDDED_TEMPLATES = await loadEmbeddedTemplates();
  const assetName = path.basename(assetPath);
  if (EMBEDDED_TEMPLATES[assetName]) {
    metrics.serverCacheHits++;
    return cacheManager.serveWithCache(EMBEDDED_TEMPLATES[assetName], getMimeType(assetPath), request);
  }

  return null;
}

async function handleMeta(route, request, { contentCache, siteConfig, cacheManager, metrics }) {
  const cacheKey = route.substring(1);

  if (cacheManager.dynamicContentCache.has(cacheKey)) {
    metrics.serverCacheHits++;
    const cached = cacheManager.dynamicContentCache.get(cacheKey);
    const mimeType = route.endsWith('.json') ? 'application/json; charset=utf-8' :
                     route.endsWith('.xml') ? 'application/xml; charset=utf-8' :
                     'text/plain; charset=utf-8';
    return cacheManager.serveWithCache(cached.content, mimeType, request);
  }

  let content, mimeType;

  switch (route) {
    case '/search.json':
      content = generateSearchIndex(contentCache);
      mimeType = 'application/json; charset=utf-8';
      break;

    case '/rss.xml':
      content = generateRSS(contentCache, siteConfig);
      mimeType = 'application/xml; charset=utf-8';
      break;

    case '/sitemap.xml':
      content = await generateSitemap(contentCache, siteConfig);
      mimeType = 'application/xml; charset=utf-8';
      break;

    case '/robots.txt':
    case '/llms.txt':
      const { themeAssets, activeTheme } = await getThemeAssets();
      const filename = route.substring(1);

      if (themeAssets.has(filename)) {
        const asset = themeAssets.get(filename);
        if (asset.type === 'template') {
          content = asset.compiled({
            siteUrl: siteConfig.url || 'https://example.com',
            ...siteConfig
          });
        } else {
          content = asset.content;
        }
      } else if (siteConfig.strictThemeIsolation !== true) {
        const EMBEDDED_TEMPLATES = await loadEmbeddedTemplates();
        if (EMBEDDED_TEMPLATES[filename]) {
          const Handlebars = await import('handlebars');
          const template = Handlebars.default.compile(EMBEDDED_TEMPLATES[filename]);
          content = template({
            siteUrl: siteConfig.url || 'https://example.com',
            ...siteConfig
          });
        }
      } else {
        content = route === '/robots.txt'
          ? `User-agent: *\nAllow: /\n\nSitemap: ${siteConfig.url || 'https://example.com'}/sitemap.xml\n`
          : `# ${siteConfig.title || 'My Site'}\n\n> ${siteConfig.description || 'A site powered by THYPRESS'}\n\n## Sitemap\n${siteConfig.url || 'https://example.com'}/sitemap.xml\n`;
      }
      mimeType = 'text/plain; charset=utf-8';
      break;
  }

  metrics.serverRenderHits++;
  cacheManager.dynamicContentCache.set(cacheKey, { content });
  return cacheManager.serveWithCache(content, mimeType, request);
}

async function handleTagPage(tag, request, { contentCache, templatesCache, navigation, cacheManager, metrics }) {
  const cacheKey = `__tag_${tag}`;

  const precompressed = cacheManager.servePrecompressed(cacheKey, request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get(cacheKey);
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  try {
    metrics.serverRenderHits++;
    const html = injectLiveReloadScript(renderTagPage(contentCache, tag, templatesCache, navigation));
    cacheManager.renderedCache.set(cacheKey, html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handleCategoryPage(category, request, { contentCache, templatesCache, navigation, cacheManager, metrics }) {
  const cacheKey = `__category_${category}`;

  const precompressed = cacheManager.servePrecompressed(cacheKey, request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get(cacheKey);
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  try {
    metrics.serverRenderHits++;
    const html = injectLiveReloadScript(renderCategoryPage(contentCache, category, templatesCache, navigation));
    cacheManager.renderedCache.set(cacheKey, html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handleSeriesPage(seriesSlug, request, { contentCache, templatesCache, navigation, cacheManager, metrics }) {
  const cacheKey = `__series_${seriesSlug}`;

  const precompressed = cacheManager.servePrecompressed(cacheKey, request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get(cacheKey);
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  try {
    metrics.serverRenderHits++;
    const allSeries = getAllSeries(contentCache);
    const series = allSeries.find(s => slugify(s) === seriesSlug);
    if (!series) {
      return handle404(request, { cacheManager, activeTheme, siteConfig, metrics });
    }
    const html = injectLiveReloadScript(renderSeriesPage(contentCache, series, templatesCache, navigation));
    cacheManager.renderedCache.set(cacheKey, html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handlePagination(page, request, { contentCache, templatesCache, navigation, siteConfig, cacheManager, metrics }) {
  const cacheKey = `__index_${page}`;

  const precompressed = cacheManager.servePrecompressed(cacheKey, request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get(cacheKey);
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  try {
    metrics.serverRenderHits++;
    const html = injectLiveReloadScript(renderEntryList(contentCache, page, templatesCache, navigation, siteConfig));
    cacheManager.renderedCache.set(cacheKey, html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

function handleHomepage(request, { contentCache, siteConfig, templatesCache, navigation, cacheManager, metrics }) {
  if (siteConfig.index) {
    const customEntry = contentCache.get(siteConfig.index);
    if (customEntry) {
      const precompressed = cacheManager.servePrecompressed(siteConfig.index, request);
      if (precompressed) {
        metrics.serverCacheHits++;
        return precompressed;
      }

      const preRendered = cacheManager.renderedCache.get(siteConfig.index);
      if (preRendered) {
        metrics.serverCacheHits++;
        const html = injectLiveReloadScript(preRendered);
        return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
      }

      metrics.serverRenderHits++;
      if (customEntry.type === 'html' && customEntry.renderedHtml !== null) {
        const html = injectLiveReloadScript(customEntry.renderedHtml);
        return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
      }
      const html = injectLiveReloadScript(renderEntry(customEntry, customEntry.slug, templatesCache, navigation, siteConfig, contentCache));
      cacheManager.renderedCache.set(siteConfig.index, html);
      return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
    }
  }

  const indexEntry = contentCache.get('index');
  if (indexEntry) {
    const precompressed = cacheManager.servePrecompressed('index', request);
    if (precompressed) {
      metrics.serverCacheHits++;
      return precompressed;
    }

    const preRendered = cacheManager.renderedCache.get('index');
    if (preRendered) {
      metrics.serverCacheHits++;
      const html = injectLiveReloadScript(preRendered);
      return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
    }

    metrics.serverRenderHits++;
    if (indexEntry.type === 'html' && indexEntry.renderedHtml !== null) {
      const html = injectLiveReloadScript(indexEntry.renderedHtml);
      return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
    }
    const html = injectLiveReloadScript(renderEntry(indexEntry, 'index', templatesCache, navigation, siteConfig, contentCache));
    cacheManager.renderedCache.set('index', html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  const precompressed = cacheManager.servePrecompressed('__index_1', request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get('__index_1');
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  metrics.serverRenderHits++;
  const html = injectLiveReloadScript(renderEntryList(contentCache, 1, templatesCache, navigation, siteConfig));
  cacheManager.renderedCache.set('__index_1', html);
  return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
}

function handleEntryPage(entry, slug, request, { templatesCache, navigation, siteConfig, contentCache, cacheManager, metrics }) {
  const precompressed = cacheManager.servePrecompressed(slug, request);
  if (precompressed) {
    metrics.serverCacheHits++;
    return precompressed;
  }

  const preRendered = cacheManager.renderedCache.get(slug);
  if (preRendered) {
    metrics.serverCacheHits++;
    const html = injectLiveReloadScript(preRendered);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  }

  try {
    metrics.serverRenderHits++;
    if (entry.type === 'html' && entry.renderedHtml !== null) {
      const html = injectLiveReloadScript(entry.renderedHtml);
      cacheManager.renderedCache.set(slug, html);
      return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
    }

    const html = injectLiveReloadScript(renderEntry(entry, slug, templatesCache, navigation, siteConfig, contentCache));
    cacheManager.renderedCache.set(slug, html);
    return cacheManager.serveWithCache(html, 'text/html; charset=utf-8', request);
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handle404(request, { cacheManager, activeTheme, siteConfig, metrics }) {
  const cacheKey = '404.html';

  if (cacheManager.dynamicContentCache.has(cacheKey)) {
    const cached = cacheManager.dynamicContentCache.get(cacheKey);
    const response = await cacheManager.serveWithCache(cached.content, 'text/html; charset=utf-8', request);
    return new Response(response.body, {
      status: 404,
      headers: response.headers
    });
  }

  const custom404Path = path.join(process.cwd(), 'templates', activeTheme || '.default', '404.html');
  let content404 = null;

  if (fsSync.existsSync(custom404Path)) {
    try {
      content404 = await fs.readFile(custom404Path, 'utf-8');
    } catch (error) {}
  }

  if (!content404 && siteConfig.strictThemeIsolation !== true) {
    const EMBEDDED_TEMPLATES = await loadEmbeddedTemplates();
    content404 = EMBEDDED_TEMPLATES['404.html'];
  }

  if (!content404) {
    content404 = `<!DOCTYPE html>
<html><body>
<h1>404 - Not Found</h1>
<p><a href="/">Back to Home</a></p>
</body></html>`;
  }

  cacheManager.dynamicContentCache.set(cacheKey, { content: content404 });

  const response = await cacheManager.serveWithCache(content404, 'text/html; charset=utf-8', request);
  return new Response(response.body, {
    status: 404,
    headers: response.headers
  });
}

async function handleAdmin(request, deps) {
  const url = new URL(request.url);
  const route = url.pathname;

  // Get available themes
  if (route === '/__thypress/themes' && request.method === 'GET') {
    const { scanAvailableThemes } = await import('./theme-system.js');
    const themes = scanAvailableThemes();
    const activeThemeId = deps.siteConfig.theme || deps.activeTheme || 'my-press';

    themes.forEach(theme => {
      theme.active = theme.id === activeThemeId;
    });

    return new Response(JSON.stringify(themes), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Set active theme
  if (route === '/__thypress/themes/set' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { themeId } = body;

      if (!themeId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'themeId required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const { loadTheme, setActiveTheme } = await import('./theme-system.js');

      const testTheme = await loadTheme(themeId);

      if (testTheme.activeTheme !== '.default' && testTheme.validation && !testTheme.validation.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Theme validation failed',
          errors: testTheme.validation.errors,
          warnings: testTheme.validation.warnings
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      setActiveTheme(themeId);
      deps.siteConfig = (await import('./utils/taxonomy.js')).getSiteConfig();

      return new Response(JSON.stringify({
        success: true,
        message: `Theme "${themeId}" activated`,
        theme: themeId,
        warnings: testTheme.validation?.warnings || []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Build static site
  if (route === '/__thypress/build' && request.method === 'POST') {
    if (deps.isBuildingStatic) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Build already in progress'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    deps.isBuildingStatic = true;

    try {
      const buildModule = await import('./build.js');
      await buildModule.build();

      return new Response(JSON.stringify({
        success: true,
        message: 'Build complete'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } finally {
      deps.isBuildingStatic = false;
    }
  }

  // Clear cache
  if (route === '/__thypress/clear-cache' && request.method === 'POST') {
    const itemsFreed = deps.cacheManager.clearAll();

    await deps.preRenderAllContent();
    await deps.preCompressContent();

    return new Response(JSON.stringify({
      success: true,
      freed: itemsFreed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Admin panel HTML
  if (route === '/__thypress/' || route === '/__thypress') {
    const adminHtml = generateAdminHTML(deps);
    return new Response(adminHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  return new Response('Not Found', { status: 404 });
}

function generateAdminHTML(deps) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>THYPRESS Admin</title>
  <style>
    body {
      font-family: monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
    }
    h1 { color: #2a2a2a; }
    h2 { margin-top: 2rem; border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; }
    .stats {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .stats p { margin: 10px 0; }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: #1d7484;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      border: none;
      font-size: 16px;
      cursor: pointer;
      margin: 10px 10px 10px 0;
      font-family: inherit;
    }
    .button:hover { background: #982c61; }
    .button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .button-secondary {
      background: #666;
    }
    .button-secondary:hover {
      background: #444;
    }
    #status {
      margin: 20px 0;
      padding: 12px;
      border-radius: 4px;
      display: none;
    }
    #status.info {
      background: #e3f2fd;
      color: #1976d2;
      display: block;
    }
    #status.success {
      background: #e8f5e9;
      color: #388e3c;
      display: block;
    }
    #status.error {
      background: #ffebee;
      color: #d32f2f;
      display: block;
    }
    .back {
      color: #1d7484;
      text-decoration: none;
    }
    .back:hover { text-decoration: underline; }
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
      margin: 2rem 0;
    }
    .theme-card {
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 1.25rem;
      background: white;
      transition: all 0.2s;
    }
    .theme-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .theme-card.active {
      border-color: #1d7484;
      background: #f0f9fa;
    }
    .theme-card.invalid {
      border-color: #d32f2f;
      background: #fff5f5;
      opacity: 0.8;
    }
    .theme-preview {
      width: 100%;
      height: 140px;
      background: #e0e0e0;
      border-radius: 4px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 0.9rem;
    }
    .theme-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 0.5rem;
      gap: 0.5rem;
    }
    .theme-name {
      font-weight: 600;
      font-size: 1.1rem;
      margin: 0;
      flex: 1;
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
    .badge-active {
      background: #1d7484;
      color: white;
    }
    .badge-embedded {
      background: #666;
      color: white;
    }
    .badge-invalid {
      background: #d32f2f;
      color: white;
    }
    .theme-meta {
      font-size: 0.85rem;
      color: #666;
      margin: 0.5rem 0;
    }
    .theme-description {
      font-size: 0.9rem;
      color: #555;
      margin: 0.75rem 0;
      line-height: 1.4;
      min-height: 2.8em;
    }
    .theme-actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
    }
  </style>
</head>
<body>
  <p><a href="/" class="back">← Back to site</a></p>

  <h1>THYPRESS Admin</h1>

  <div class="stats">
    <p><strong>Entries:</strong> ${deps.contentCache.size}</p>
    <p><strong>Mode:</strong> ${deps.contentMode}</p>
    <p><strong>Content root:</strong> ${deps.contentRoot}</p>
    <p><strong>Active theme:</strong> ${deps.activeTheme || '.default (embedded)'}</p>
    <p><strong>Pre-rendered pages:</strong> ${deps.cacheManager.renderedCache.size}</p>
    <p><strong>Pre-compressed:</strong> ${deps.cacheManager.precompressedCache.size / 2} pages × 2 formats</p>
    <p><strong>Images cached:</strong> ${deps.imageReferences.size} files with images</p>
    <p><strong>Redirect rules:</strong> ${deps.redirectRules.size}</p>
    <p><strong>Live reload:</strong> ${deps.liveReloadClients.size} connected clients</p>
  </div>

  <h2>Theme Management</h2>
  <div id="themes-container">
    <p>Loading themes...</p>
  </div>

  <h2>Build Static Site</h2>
  <p>Generate a complete static build in /build folder for deployment.</p>

  <button id="buildBtn" class="button" onclick="buildSite()">Build Static Site</button>
  <button id="clearCacheBtn" class="button button-secondary" onclick="clearCache()">Clear Cache</button>

  <div id="status"></div>

  <script>
    let themes = [];

    function setStatus(message, type) {
      const status = document.getElementById('status');
      status.textContent = message;
      status.className = type;
    }

    async function loadThemes() {
      try {
        const response = await fetch('/__thypress/themes');
        themes = await response.json();
        renderThemes();
      } catch (error) {
        document.getElementById('themes-container').innerHTML =
          '<p style="color: #d32f2f;">Failed to load themes: ' + error.message + '</p>';
      }
    }

    function renderThemes() {
      const container = document.getElementById('themes-container');

      if (themes.length === 0) {
        container.innerHTML = '<p>No themes found</p>';
        return;
      }

      container.innerHTML = '<div class="theme-grid">' + themes.map(theme => {
        const activeClass = theme.active ? 'active' : '';
        const invalidClass = !theme.valid ? 'invalid' : '';

        return \`
          <div class="theme-card \${activeClass} \${invalidClass}">
            <div class="theme-preview">No preview</div>

            <div class="theme-header">
              <h3 class="theme-name">\${theme.name}</h3>
              <div class="theme-badges">
                \${theme.active ? '<span class="theme-badge badge-active">ACTIVE</span>' : ''}
                \${theme.embedded ? '<span class="theme-badge badge-embedded">EMBEDDED</span>' : ''}
                \${!theme.valid ? '<span class="theme-badge badge-invalid">INVALID</span>' : ''}
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
            </div>
          </div>
        \`;
      }).join('') + '</div>';
    }

    async function activateTheme(themeId) {
      setStatus('Validating and activating theme...', 'info');

      try {
        const response = await fetch('/__thypress/themes/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themeId })
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

    async function buildSite() {
      const btn = document.getElementById('buildBtn');
      btn.disabled = true;
      setStatus('Building static site...', 'info');

      try {
        const response = await fetch('/__thypress/build', { method: 'POST' });
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
        const response = await fetch('/__thypress/clear-cache', { method: 'POST' });
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

    loadThemes();
  </script>
</body>
</html>`;
}

async function getThemeAssets() {
  // Helper to get current theme assets in route handlers
  const { loadTheme } = await import('./theme-system.js');
  const { getSiteConfig } = await import('./utils/taxonomy.js');
  const siteConfig = getSiteConfig();
  const theme = await loadTheme(siteConfig.theme, siteConfig);
  return theme;
}
