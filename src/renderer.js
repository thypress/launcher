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

import { Feed } from 'feed';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { selectTemplate } from './theme-system.js';
import { getEntriesSorted } from './utils/taxonomy.js';
import { getAllTags, getAllCategories, getAllSeries, slugify } from './utils/taxonomy.js';

// Re-export for backward compatibility
export { loadTheme, scanAvailableThemes, setActiveTheme, THYPRESS_FEATURES, validateTheme } from './theme-system.js';
export { loadAllContent, buildNavigationTree, detectContentStructure, processContentFile, optimizeImage, buildTocStructure, extractTitleFromContent, extractDateFromFilename, processPageMetadata, generateUrl } from './content-processor.js';
export { getAllTags, getAllCategories, getAllSeries, getEntriesSorted, slugify, normalizeToWebPath, getSiteConfig } from './utils/taxonomy.js';

export const POSTS_PER_PAGE = 10;

/**
 * Get pagination data for content list
 */
export function getPaginationData(contentCache, currentPage) {
  const totalPages = Math.ceil(contentCache.size / POSTS_PER_PAGE);
  const pages = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('...');
    }

    pages.push(totalPages);
  }

  return {
    currentPage,
    totalPages,
    pages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    prevPage: currentPage - 1,
    nextPage: currentPage + 1
  };
}

/**
 * Get related pages based on shared tags
 */
export function getRelatedEntries(page, contentCache, limit = 3) {
  const allPages = Array.from(contentCache.values());

  return allPages
    .filter(p => p.slug !== page.slug)
    .map(p => ({
      ...p,
      score: page.tags.filter(t => p.tags.includes(t)).length
    }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Render content list (index/pagination pages)
 */
 export function renderEntryList(contentCache, page, templates, navigation, siteConfig = {}) {
   const startIndex = (page - 1) * POSTS_PER_PAGE;

   const allContent = getEntriesSorted(contentCache);
   const pageContent = allContent.slice(startIndex, startIndex + POSTS_PER_PAGE);

   const items = pageContent.map(entry => ({
     slug: entry.slug,
     url: entry.url,
     title: entry.title,
     date: entry.date,
     createdAt: entry.createdAt,
     updatedAt: entry.updatedAt,
     tags: entry.tags,
     description: entry.description,
     categories: entry.categories || [],
     series: entry.series || null
   }));

   const pagination = getPaginationData(contentCache, page);

   const indexTpl = templates.get('index');
   if (!indexTpl) {
     throw new Error('Index template not found');
   }

   const {
     title: siteTitle = 'My Site',
     description: siteDescription = 'A site powered by THYPRESS',
     url: siteUrl = 'https://example.com'
   } = siteConfig;

   return indexTpl({
     entries: items,
     hasEntriesList: true,
     pagination: pagination,
     navigation: navigation,
     siteTitle: siteTitle,
     siteDescription: siteDescription,
     siteUrl: siteUrl
   });
 }

 /**
  * Render individual entry page
  */
 export function renderEntry(entry, slug, templates, navigation, siteConfig = {}, contentCache = null) {
   if (entry.type === 'html' && entry.renderedHtml) {
     return entry.renderedHtml;
   }

   const template = selectTemplate(entry, templates, 'entry');

   if (!template) {
     throw new Error(`Template not found for entry: ${slug}`);
   }

   const {
     title: siteTitle = 'My Site',
     url: siteUrl = 'https://example.com',
     author = 'Anonymous'
   } = siteConfig;

   const createdAtISO = new Date(entry.createdAt).toISOString();
   const updatedAtISO = new Date(entry.updatedAt).toISOString();

   let prevEntry = null;
   let nextEntry = null;

   if (contentCache) {
     const sortedContent = getEntriesSorted(contentCache);
     const currentIndex = sortedContent.findIndex(c => c.slug === slug);

     if (currentIndex !== -1) {
       if (currentIndex < sortedContent.length - 1) {
         prevEntry = {
           title: sortedContent[currentIndex + 1].title,
           url: sortedContent[currentIndex + 1].url
         };
       }

       if (currentIndex > 0) {
         nextEntry = {
           title: sortedContent[currentIndex - 1].title,
           url: sortedContent[currentIndex - 1].url
         };
       }
     }
   }

   const relatedEntries = contentCache ? getRelatedEntries(entry, contentCache) : [];

   const htmlToWrap = entry.html || entry.renderedHtml;
   const showToc = entry.toc && entry.toc.length > 0;

   return template({
     entry: {
       html: htmlToWrap,
       title: entry.title,
       slug: entry.slug,
       url: entry.url,
       date: entry.date,
       createdAt: entry.createdAt,
       updatedAt: entry.updatedAt,
       dateISO: createdAtISO,
       createdAtISO: createdAtISO,
       updatedAtISO: updatedAtISO,
       tags: entry.tags,
       description: entry.description,
       ogImage: entry.ogImage || null,
       wordCount: entry.wordCount,
       readingTime: entry.readingTime,
       categories: entry.categories || [],
       series: entry.series || null
     },
     siteTitle: siteTitle,
     siteUrl: siteUrl,
     author: author,
     navigation: navigation,
     frontMatter: entry.frontMatter,
     prevEntry: prevEntry,
     nextEntry: nextEntry,
     relatedEntries: relatedEntries,
     toc: entry.toc || [],
     showToc: showToc
   });
 }

/**
 * Render tag page
 */
 export function renderTagPage(contentCache, tag, templates, navigation) {
   const tagTpl = templates.get('tag') || templates.get('index');

   const allContent = getEntriesSorted(contentCache);
   const taggedContent = allContent.filter(entry => entry.tags.includes(tag));

   const items = taggedContent.map(entry => ({
     slug: entry.slug,
     url: entry.url,
     title: entry.title,
     date: entry.date,
     createdAt: entry.createdAt,
     updatedAt: entry.updatedAt,
     tags: entry.tags,
     description: entry.description
   }));

   return tagTpl({
     tag: tag,
     entries: items,
     hasEntriesList: true,
     pagination: null,
     navigation: navigation
   });
 }

/**
 * Render category page
 */
 export function renderCategoryPage(contentCache, category, templates, navigation) {
   const categoryTpl = templates.get('category') || templates.get('tag') || templates.get('index');

   const allContent = getEntriesSorted(contentCache);
   const categoryContent = allContent.filter(entry =>
     entry.categories && entry.categories.includes(category)
   );

   const items = categoryContent.map(entry => ({
     slug: entry.slug,
     url: entry.url,
     title: entry.title,
     date: entry.date,
     createdAt: entry.createdAt,
     updatedAt: entry.updatedAt,
     tags: entry.tags,
     description: entry.description
   }));

   return categoryTpl({
     category: category,
     entries: items,
     hasEntriesList: true,
     pagination: null,
     navigation: navigation
   });
 }

/**
 * Render series page
 */
 export function renderSeriesPage(contentCache, series, templates, navigation) {
   const seriesTpl = templates.get('series') || templates.get('tag') || templates.get('index');

   const allContent = getEntriesSorted(contentCache);
   const seriesContent = allContent.filter(entry => entry.series === series);

   const items = seriesContent.map(entry => ({
     slug: entry.slug,
     url: entry.url,
     title: entry.title,
     date: entry.date,
     createdAt: entry.createdAt,
     updatedAt: entry.updatedAt,
     tags: entry.tags,
     description: entry.description
   }));

   return seriesTpl({
     series: series,
     entries: items,
     hasEntriesList: true,
     pagination: null,
     navigation: navigation
   });
 }

/**
 * Generate RSS feed
 */
 export function generateRSS(contentCache, siteConfig = {}) {
   const {
     title = 'My Site',
     description = 'A site powered by THYPRESS',
     url = 'https://example.com',
     author = 'Anonymous'
   } = siteConfig;

   const feed = new Feed({
     title: title,
     description: description,
     id: url,
     link: url,
     language: 'en',
     favicon: `${url}/favicon.ico`,
     copyright: `All rights reserved ${new Date().getFullYear()}, ${author}`,
     author: {
       name: author,
       link: url
     }
   });

   const allContent = getEntriesSorted(contentCache);
   const recentContent = allContent.slice(0, 20);

   recentContent.forEach(entry => {
     feed.addItem({
       title: entry.title,
       id: `${url}${entry.url}`,
       link: `${url}${entry.url}`,
       description: entry.description || (entry.rawContent || entry.html || '').substring(0, 200),
       content: entry.html || entry.renderedHtml,
       author: [{ name: author }],
       date: new Date(entry.createdAt),
       published: new Date(entry.createdAt),
       updated: new Date(entry.updatedAt),
       category: entry.tags.map(tag => ({ name: tag }))
     });
   });

   return feed.rss2();
 }

/**
 * Generate sitemap
 */
export async function generateSitemap(contentCache, siteConfig = {}) {
  const { url = 'https://example.com' } = siteConfig;

  const allContent = getEntriesSorted(contentCache);
  const allTags = getAllTags(contentCache);
  const allCategories = getAllCategories(contentCache);
  const allSeries = getAllSeries(contentCache);

  const links = [];

  links.push({
    url: '/',
    changefreq: 'daily',
    priority: 1.0
  });

  allContent.forEach(entry => {
    links.push({
      url: entry.url,
      lastmod: entry.updatedAt,
      changefreq: 'monthly',
      priority: 0.8
    });
  });

  allTags.forEach(tag => {
    links.push({
      url: `/tag/${tag}/`,
      changefreq: 'weekly',
      priority: 0.5
    });
  });

  allCategories.forEach(category => {
    links.push({
      url: `/category/${category}/`,
      changefreq: 'weekly',
      priority: 0.6
    });
  });

  allSeries.forEach(series => {
    links.push({
      url: `/series/${slugify(series)}/`,
      changefreq: 'weekly',
      priority: 0.6
    });
  });

  const stream = new SitemapStream({ hostname: url });
  const xml = await streamToPromise(Readable.from(links).pipe(stream));

  return xml.toString();
}

/**
 * Generate search index JSON
 */
export function generateSearchIndex(contentCache) {
  const allContent = getEntriesSorted(contentCache);

  const searchData = allContent.map(entry => ({
    id: entry.slug,
    title: entry.title,
    slug: entry.slug,
    url: entry.url,
    date: entry.date,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    tags: entry.tags,
    description: entry.description,
    content: (entry.rawContent || entry.html || '')
      .replace(/[#*`\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000)
  }));

  return JSON.stringify(searchData, null, 0);
}
