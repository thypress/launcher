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

import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

export class CacheManager {
  constructor(maxSize = 50 * 1024 * 1024) {
    this.maxSize = maxSize;
    this.currentSize = 0;

    this.renderedCache = new Map();
    this.precompressedCache = new Map();
    this.staticAssetCache = new Map();
    this.dynamicContentCache = new Map();
  }

  generateETag(content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
  }

  getCacheControl(mimeType) {
    if (mimeType.includes('image') || mimeType.includes('font') ||
        mimeType === 'text/css' || mimeType === 'text/javascript') {
      return 'public, max-age=31536000, immutable';
    }
    if (mimeType === 'text/html') {
      return 'public, max-age=3600';
    }
    return 'public, max-age=300';
  }

  async compressContent(content, acceptEncoding) {
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    const supportsBrotli = acceptEncoding && acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding && acceptEncoding.includes('gzip');

    if (supportsBrotli) {
      return {
        content: await brotliCompress(contentBuffer),
        encoding: 'br'
      };
    } else if (supportsGzip) {
      return {
        content: await gzip(contentBuffer),
        encoding: 'gzip'
      };
    }

    return {
      content: contentBuffer,
      encoding: null
    };
  }

  async serveWithCache(content, mimeType, request, options = {}) {
    const { skipCompression = false, maxAge = null } = options;

    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const etag = this.generateETag(contentBuffer);
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const ifNoneMatch = request.headers.get('if-none-match');

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': maxAge || this.getCacheControl(mimeType)
        }
      });
    }

    let finalContent = contentBuffer;
    let contentEncoding = null;

    if (!skipCompression && contentBuffer.length > 1024) {
      const compressed = await this.compressContent(contentBuffer, acceptEncoding);
      finalContent = compressed.content;
      contentEncoding = compressed.encoding;
    }

    const headers = {
      'Content-Type': mimeType,
      'ETag': etag,
      'Cache-Control': maxAge || this.getCacheControl(mimeType),
      'Vary': 'Accept-Encoding'
    };

    if (contentEncoding) {
      headers['Content-Encoding'] = contentEncoding;
    }

    return new Response(finalContent, { headers });
  }

  servePrecompressed(slug, request, mimeType = 'text/html; charset=utf-8') {
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const ifNoneMatch = request.headers.get('if-none-match');

    const preferBrotli = acceptEncoding.includes('br');
    const cacheKey = preferBrotli ? `${slug}:br` : `${slug}:gzip`;

    const cached = this.precompressedCache.get(cacheKey);
    if (!cached) return null;

    if (ifNoneMatch === cached.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': cached.etag,
          'Cache-Control': this.getCacheControl(mimeType)
        }
      });
    }

    return new Response(cached.content, {
      headers: {
        'Content-Type': mimeType,
        'Content-Encoding': cached.encoding,
        'ETag': cached.etag,
        'Cache-Control': this.getCacheControl(mimeType),
        'Vary': 'Accept-Encoding'
      }
    });
  }

  addStaticAsset(key, content, mimeType) {
    if (content.length < 5 * 1024 * 1024) {
      this.staticAssetCache.set(key, { content, mimeType, lastAccessed: Date.now() });
      this.currentSize += content.length;

      if (this.currentSize > this.maxSize) {
        // Find oldest accessed item
        let oldestKey = null;
        let oldestTime = Date.now();
        for (const [k, v] of this.staticAssetCache) {
          if (v.lastAccessed < oldestTime) {
            oldestTime = v.lastAccessed;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          const item = this.staticAssetCache.get(oldestKey);
          this.currentSize -= item.content.length;
          this.staticAssetCache.delete(oldestKey);
        }
      }
    }
  }

  clearAll() {
    const itemsFreed = this.staticAssetCache.size +
                       this.dynamicContentCache.size +
                       this.renderedCache.size +
                       this.precompressedCache.size;

    this.staticAssetCache.clear();
    this.dynamicContentCache.clear();
    this.renderedCache.clear();
    this.precompressedCache.clear();
    this.currentSize = 0;

    return itemsFreed;
  }

  getStats() {
    return {
      rendered: this.renderedCache.size,
      precompressed: this.precompressedCache.size / 2,
      staticAssets: this.staticAssetCache.size,
      dynamicContent: this.dynamicContentCache.size,
      totalSize: this.currentSize
    };
  }
}

export const metrics = {
  requests: 0,
  httpCacheHits: 0,
  serverCacheHits: 0,
  serverRenderHits: 0,
  responseTimes: []
};
