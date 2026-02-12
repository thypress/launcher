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

/**
 * Build unified template context for all page types
 * Passes FULL objects - no cherry-picking, maximum extensibility
 *
 * @param {string} pageType - 'entry', 'index', 'tag', 'category', 'series', '404'
 * @param {object} data - Page-specific data
 * @param {object} siteConfig - Full config.json object
 * @param {array} navigation - Navigation tree
 * @param {object} themeMetadata - Theme metadata from theme.json or front-matter
 * @returns {object} Complete template context
 */
export function buildTemplateContext(pageType, data, siteConfig = {}, navigation = [], themeMetadata = {}) {
  // Base context - ALWAYS present in every template
  const context = {
    // === FULL OBJECTS (extensible) ===
    config: { ...siteConfig },           // ALL config.json fields
    theme: { ...themeMetadata },         // ALL theme metadata fields

    // === STRUCTURAL ===
    navigation: navigation,              // Navigation tree
    pageType: pageType,                  // Current page type identifier
  };

  // Add page-specific context
  switch (pageType) {
    case 'entry':
      Object.assign(context, {
        // Full entry object with ALL fields (including custom front-matter)
        entry: { ...data.entry },

        // Navigation
        prevEntry: data.prevEntry || null,
        nextEntry: data.nextEntry || null,

        // Related content
        relatedEntries: data.relatedEntries || [],

        // Table of contents
        toc: data.toc || [],
        hasToc: (data.toc && data.toc.length > 0) || false,
      });
      break;

    case 'index':
      Object.assign(context, {
        entries: data.entries || [],
        hasEntriesList: true,
        pagination: data.pagination || null,
      });
      break;

    case 'tag':
      Object.assign(context, {
        tag: data.tag,
        entries: data.entries || [],
        hasEntriesList: true,
      });
      break;

    case 'category':
      Object.assign(context, {
        category: data.category,
        entries: data.entries || [],
        hasEntriesList: true,
      });
      break;

    case 'series':
      Object.assign(context, {
        series: data.series,
        entries: data.entries || [],
        hasEntriesList: true,
      });
      break;
  }

  return context;
}
