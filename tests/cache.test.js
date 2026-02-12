import { describe, test, expect } from 'bun:test';
import { CacheManager } from '../src/cache.js';

describe('Cache Manager', () => {
  test('generates consistent ETags', () => {
    const cache = new CacheManager();
    const etag1 = cache.generateETag('test content');
    const etag2 = cache.generateETag('test content');
    expect(etag1).toBe(etag2);
  });

  test('returns 304 on matching ETag', async () => {
    const cache = new CacheManager();
    const content = 'test content';
    const etag = cache.generateETag(content);
    
    const req = new Request('http://localhost/', {
      headers: { 'if-none-match': etag }
    });
    
    const res = await cache.serveWithCache(content, 'text/html', req);
    expect(res.status).toBe(304);
  });

  test('compresses content when accept-encoding includes gzip', async () => {
    const cache = new CacheManager();
    const content = 'x'.repeat(2000); // >1024 bytes
    
    const req = new Request('http://localhost/', {
      headers: { 'accept-encoding': 'gzip' }
    });
    
    const res = await cache.serveWithCache(content, 'text/html', req);
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });

  test('prefers brotli over gzip', async () => {
    const cache = new CacheManager();
    const content = 'x'.repeat(2000);
    
    const req = new Request('http://localhost/', {
      headers: { 'accept-encoding': 'gzip, br' }
    });
    
    const res = await cache.serveWithCache(content, 'text/html', req);
    expect(res.headers.get('content-encoding')).toBe('br');
  });
});