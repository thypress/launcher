import { describe, test, expect, beforeEach } from 'bun:test';
import { handleRequest } from '../src/routes.js';

describe('Route Handling', () => {
  let mockDeps;

  beforeEach(() => {
    mockDeps = {
      contentCache: new Map([
        ['hello', {
          slug: 'hello',
          title: 'Hello',
          html: '<p>Hello</p>',
          type: 'md',
          tags: [],
          categories: [],
          date: '2024-01-01',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          url: '/hello/',
          description: 'Test'
        }]
      ]),
      templatesCache: new Map([
        ['entry', (ctx) => '<html><body>entry</body></html>'],
        ['index', (ctx) => '<html><body>index</body></html>']
      ]),
      cacheManager: {
        servePrecompressed: () => null,
        renderedCache: new Map(),
        dynamicContentCache: new Map(),
        serveWithCache: (content, mime) => new Response(content, { headers: { 'Content-Type': mime } })
      },
      metrics: { serverCacheHits: 0, serverRenderHits: 0 },
      navigation: [],
      siteConfig: {},
      themeMetadata: {},
      redirectRules: new Map(),
      activeTheme: '.default',
      contentRoot: process.cwd(),
      themeAssets: new Map()
    };
  });

  test('handles homepage request', async () => {
    const req = new Request('http://localhost:3009/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  test('handles entry page request', async () => {
    const req = new Request('http://localhost:3009/hello/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(200);
  });

  test('returns 404 for missing page', async () => {
    mockDeps.cacheManager.dynamicContentCache = new Map();
    const req = new Request('http://localhost:3009/nonexistent/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(404);
  });

  test('handles tag pages', async () => {
    mockDeps.contentCache.get('hello').tags = ['test'];
    const req = new Request('http://localhost:3009/tag/test/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(200);
  });

  test('handles redirects with 301', async () => {
    mockDeps.redirectRules.set('/old/', { to: '/new/', statusCode: 301 });
    const req = new Request('http://localhost:3009/old/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toContain('/new/');
  });

  test('handles pattern redirects', async () => {
    mockDeps.redirectRules.set('/blog/:slug/', { to: '/pages/:slug/', statusCode: 301 });
    const req = new Request('http://localhost:3009/blog/hello/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toContain('/pages/hello/');
  });

  test('serves precompressed content when available', async () => {
    mockDeps.cacheManager.servePrecompressed = () =>
      new Response('compressed', { headers: { 'content-encoding': 'br' } });

    const req = new Request('http://localhost:3009/hello/');
    const res = await handleRequest(req, null, mockDeps);
    expect(res.headers.get('content-encoding')).toBe('br');
  });
});
