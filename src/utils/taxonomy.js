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

import fs from 'fs';
import path from 'path';

/**
 * Unicode-safe slugify function
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize file path to web path (forward slashes)
 */
export function normalizeToWebPath(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * Get all tags from content cache
 */
export function getAllTags(contentCache) {
  const tags = new Set();
  for (const content of contentCache.values()) {
    content.tags.forEach(tag => tags.add(tag));
  }
  return Array.from(tags).sort();
}

/**
 * Get all categories from content cache
 */
export function getAllCategories(contentCache) {
  const categories = new Set();
  for (const content of contentCache.values()) {
    if (content.categories) {
      content.categories.forEach(cat => categories.add(cat));
    }
  }
  return Array.from(categories).sort();
}

/**
 * Get all series from content cache
 */
export function getAllSeries(contentCache) {
  const series = new Set();
  for (const content of contentCache.values()) {
    if (content.series) {
      series.add(content.series);
    }
  }
  return Array.from(series).sort();
}

/**
 * Get entries sorted by creation date (newest first)
 */
export function getEntriesSorted(contentCache) {
  return Array.from(contentCache.values()).sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

/**
 * Load site configuration from config.json
 */
export function getSiteConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (error) {
    console.error(errorMsg('Error loading config.json:', error.message));
    console.log(warning('Using default configuration'));
  }

  return {
    title: 'My Site',
    description: 'A site powered by THYPRESS',
    url: 'https://example.com',
    author: 'Anonymous'
  };
}
