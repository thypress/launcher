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
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import matter from 'gray-matter';
import { success, error as errorMsg, warning, info, dim } from './utils/colors.js';
import { EMBEDDED_TEMPLATES as STATIC_EMBEDDED_TEMPLATES } from './embedded-templates.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('split', (str, sep, index) => String(str).split(sep)[index]);

// ============================================================================
// TEMPLATE VALIDATION
// ============================================================================

/**
 * Validates a Handlebars template string for syntax errors.
 * @param {string} templateString - The raw template string.
 * @param {string} filePath - Optional filename for better error messages.
 * @returns {boolean} - True if valid, False if invalid.
 */
export function validateTemplate(templateString, filePath = 'unknown file') {
  try {
    // precompile throws immediately if the syntax is invalid
    Handlebars.precompile(templateString);
    return true;
  } catch (err) {
    console.error(errorMsg(`Template Syntax Error in ${filePath}:`));
    console.error(err.message);
    return false;
  }
}

// ============================================================================
// THYPRESS FEATURE REGISTRY
// ============================================================================
// Purpose: Validation + Documentation only (NOT runtime filtering)
// ============================================================================

export const THYPRESS_FEATURES = {
  // === Core Data ===
  config: {
    since: '0.1.0',
    description: 'Full site configuration from config.json',
    example: '{{config.title}}, {{config.customField}}'
  },

  theme: {
    since: '0.3.0',
    description: 'Theme metadata from theme.json or front-matter',
    example: '{{theme.name}}, {{theme.accentColor}}'
  },

  navigation: {
    since: '0.1.0',
    description: 'Site navigation tree',
    example: '{{#each navigation}}...{{/each}}'
  },

  pageType: {
    since: '0.3.0',
    description: 'Current page type identifier',
    example: '{{#if (eq pageType "entry")}}...{{/if}}'
  },

  // === Entry Context ===
  entry: {
    since: '0.1.0',
    description: 'Current entry object (title, html, tags, etc + all custom fields)',
    example: '{{entry.title}}, {{{entry.html}}}, {{entry.customField}}'
  },

  // === Lists ===
  entries: {
    since: '0.1.0',
    description: 'Array of entries for index/tag/category pages',
    example: '{{#each entries}}{{title}}{{/each}}'
  },

  pagination: {
    since: '0.1.0',
    description: 'Pagination data for multi-page lists',
    example: '{{pagination.currentPage}}, {{pagination.hasNext}}'
  },

  hasEntriesList: {
    since: '0.3.0',
    description: 'Boolean flag indicating list pages',
    example: '{{#if hasEntriesList}}...{{/if}}'
  },

  // === Taxonomies ===
  tags: {
    since: '0.1.0',
    description: 'Entry tags array',
    example: '{{#each entry.tags}}{{this}}{{/each}}'
  },

  categories: {
    since: '0.2.0',
    description: 'Entry categories array',
    example: '{{#each entry.categories}}{{this}}{{/each}}'
  },

  series: {
    since: '0.2.0',
    description: 'Entry series name',
    example: '{{entry.series}}'
  },

  tag: {
    since: '0.1.0',
    description: 'Current tag name (on tag pages)',
    example: '{{tag}}'
  },

  category: {
    since: '0.2.0',
    description: 'Current category name (on category pages)',
    example: '{{category}}'
  },

  // === Features ===
  toc: {
    since: '0.2.0',
    description: 'Table of contents tree from headings (H2-H4)',
    example: '{{#if hasToc}}{{> _toc-tree items=toc}}{{/if}}'
  },

  hasToc: {
    since: '0.3.0',
    description: 'Boolean flag for TOC display',
    example: '{{#if hasToc}}...{{/if}}'
  },

  relatedEntries: {
    since: '0.2.0',
    description: 'Tag-based related entries',
    example: '{{#each relatedEntries}}{{title}}{{/each}}'
  },

  prevEntry: {
    since: '0.2.0',
    description: 'Previous entry in chronological order',
    example: '{{#if prevEntry}}<a href="{{prevEntry.url}}">{{prevEntry.title}}</a>{{/if}}'
  },

  nextEntry: {
    since: '0.2.0',
    description: 'Next entry in chronological order',
    example: '{{#if nextEntry}}<a href="{{nextEntry.url}}">{{nextEntry.title}}</a>{{/if}}'
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shouldIgnore(name) {
  return name.startsWith('.');
}

/**
 * Compare semantic versions
 */
function compareVersions(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;

    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }

  return 0;
}

// ============================================================================
// THEME VALIDATION
// ============================================================================

/**
 * Validate theme requirements against THYPRESS runtime
 * Simplified: Just check feature exists and version compatibility
 */
export function validateThemeRequirements(themeMetadata, thypressVersion) {
  const warnings = [];
  const errors = [];

  const requires = themeMetadata.requires || [];

  for (const required of requires) {
    const feature = THYPRESS_FEATURES[required];

    // ERROR: Unknown feature
    if (!feature) {
      errors.push({
        type: 'unknown-feature',
        feature: required,
        message: `Unknown feature '${required}' - check spelling or update THYPRESS`
      });
      continue;
    }

    // ERROR: Version mismatch
    if (compareVersions(thypressVersion, feature.since) < 0) {
      errors.push({
        type: 'version-mismatch',
        feature: required,
        message: `Theme requires '${required}' (added in THYPRESS ${feature.since}), but you're running ${thypressVersion}`,
        requiredVersion: feature.since,
        currentVersion: thypressVersion
      });
      continue;
    }
  }

  return { errors, warnings };
}

/**
 * Validate theme structure and completeness
 */
export function validateTheme(themePath, templatesCache, themeName, themeMetadata = {}) {
  const errors = [];
  const warnings = [];
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
  );
  const thypressVersion = packageJson.version;

  // Only index.html is required
  if (!templatesCache.has('index')) {
    errors.push(`Missing required template: index.html`);
  }

  // Scan templates for partial references
  const requiredPartials = new Set();
  const availablePartials = new Set();

  const registeredPartials = Object.keys(Handlebars.partials);
  registeredPartials.forEach(p => availablePartials.add(p));

  if (fs.existsSync(themePath)) {
    const scanForPartials = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name !== 'partials') {
            scanForPartials(fullPath);
          }
        } else if (entry.name.endsWith('.html')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const partialRefs = content.matchAll(/\{\{>\s*([a-zA-Z0-9_/-]+)\s*\}\}/g);

            for (const match of partialRefs) {
              let partialName = match[1];
              if (partialName.startsWith('_')) {
                partialName = partialName.substring(1);
              }
              requiredPartials.add(partialName);
            }
          } catch (error) {
            // Ignore read errors
          }
        }
      }
    };

    scanForPartials(themePath);
  }

  const missingPartials = [];
  for (const partial of requiredPartials) {
    const variations = [
      partial,
      `_${partial}`,
      `partials/${partial}`,
      `partials/_${partial}`
    ];

    const found = variations.some(v => availablePartials.has(v));

    if (!found) {
      missingPartials.push(partial);
    }
  }

  if (missingPartials.length > 0) {
    errors.push(
      `Missing partials: ${missingPartials.join(', ')}\n` +
      `  Expected locations:\n` +
      missingPartials.map(p => `    - templates/${themeName}/partials/_${p}.html`).join('\n')
    );
  }

  // Feature requirements validation
  if (themeMetadata.requires && themeMetadata.requires.length > 0) {
    const featureValidation = validateThemeRequirements(
      themeMetadata,
      thypressVersion
    );

    errors.push(...featureValidation.errors.map(e => e.message));
    warnings.push(...featureValidation.warnings.map(w => w.message));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// THEME DISCOVERY
// ============================================================================

/**
 * Auto-detect preview image in theme directory
 * Looks for preview.png, preview.jpg, preview.webp in order
 * @param {string} themeDir - Theme directory path
 * @returns {string|null} Preview filename or null
 */
function detectPreviewImage(themeDir) {
  const extensions = ['png', 'jpg', 'jpeg', 'webp'];

  for (const ext of extensions) {
    const previewPath = path.join(themeDir, `preview.${ext}`);
    if (fs.existsSync(previewPath)) {
      return `preview.${ext}`;
    }
  }

  return null;
}

/**
 * Scan available themes in templates directory
 */
export function scanAvailableThemes() {
  const templatesDir = path.join(process.cwd(), 'templates');
  const themes = [];

  // Always include embedded .default
  themes.push({
    id: '.default',
    name: 'Default (Embedded)',
    version: '1.0.0',
    description: 'Built-in THYPRESS theme',
    author: 'THYPRESS',
    embedded: true,
    valid: true,
    active: false,
    preview: null
  });

  if (!fs.existsSync(templatesDir)) {
    return themes;
  }

  const entries = fs.readdirSync(templatesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const themeDir = path.join(templatesDir, entry.name);
    const themeJsonPath = path.join(themeDir, 'theme.json');
    const indexHtmlPath = path.join(themeDir, 'index.html');

    let metadata = {
      id: entry.name,
      name: entry.name,
      version: 'unknown',
      description: 'No description available',
      author: 'Unknown',
      embedded: false,
      valid: true,
      active: false,
      preview: null
    };

    // Priority 1: theme.json
    if (fs.existsSync(themeJsonPath)) {
      try {
        const themeData = JSON.parse(fs.readFileSync(themeJsonPath, 'utf-8'));
        metadata = {
          id: entry.name,
          name: themeData.name || entry.name,
          version: themeData.version || 'unknown',
          description: themeData.description || 'No description',
          author: themeData.author || 'Unknown',
          license: themeData.license,
          homepage: themeData.homepage,
          preview: themeData.preview || null,
          tags: themeData.tags || [],
          requires: themeData.requires || [],
          embedded: false,
          valid: true,
          active: false
        };
      } catch (error) {
        metadata.error = `Invalid theme.json: ${error.message}`;
        metadata.valid = false;
      }
    }
    // Priority 2: front-matter in index.html
    else if (fs.existsSync(indexHtmlPath)) {
      try {
        const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8');
        const { data: frontMatter } = matter(indexContent);

        if (Object.keys(frontMatter).length > 0 && (frontMatter.name || frontMatter.version || frontMatter.requires)) {
          metadata = {
            id: entry.name,
            name: frontMatter.name || entry.name,
            version: frontMatter.version || 'unknown',
            description: frontMatter.description || 'No description',
            author: frontMatter.author || 'Unknown',
            license: frontMatter.license,
            homepage: frontMatter.homepage,
            preview: frontMatter.preview || null,
            tags: frontMatter.tags || [],
            requires: frontMatter.requires || [],
            embedded: false,
            valid: true,
            active: false
          };
        }
      } catch (error) {
        // Silently ignore
      }
    }

    // Priority 3: Auto-detect preview image if not specified in metadata
    if (!metadata.preview) {
      const autoPreview = detectPreviewImage(themeDir);
      if (autoPreview) {
        metadata.preview = autoPreview;
      }
    }

    // Check required files
    const hasIndexHtml = fs.existsSync(path.join(themeDir, 'index.html'));

    if (!hasIndexHtml) {
      metadata.valid = false;
      metadata.error = 'Missing required file: index.html';
    }

    themes.push(metadata);
  }

  return themes;
}

/**
 * Set active theme in config.json
 */
export function setActiveTheme(themeId) {
  const configPath = path.join(process.cwd(), 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  config.theme = themeId;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return { success: true, theme: themeId };
}

// ============================================================================
// EMBEDDED TEMPLATES LOADER
// ============================================================================

// Module-level flag for dev mode logging
let hasLoggedDevMode = false;

function canWriteToSrcDir() {
  try {
    fs.accessSync(__dirname, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function isEmbeddedTemplatesStale(embeddedPath) {
  const templatesPath = path.join(__dirname, '../templates/.default');
  if (!fs.existsSync(templatesPath)) return false;
  if (!fs.existsSync(embeddedPath)) return false;

  try {
    const embeddedMtime = fs.statSync(embeddedPath).mtime.getTime();
    const templateFiles = fs.readdirSync(templatesPath);

    for (const file of templateFiles) {
      const filePath = path.join(templatesPath, file);
      if (!fs.statSync(filePath).isFile()) continue;

      const fileMtime = fs.statSync(filePath).mtime.getTime();
      if (fileMtime > embeddedMtime) {
        return true;
      }
    }
  } catch (error) {
    return false;
  }

  return false;
}

function loadTemplatesFromDisk(dir) {
  const templates = {};

  function scan(currentDir, relativePath = '') {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        scan(fullPath, relPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.css', '.js', '.txt', '.xml'].includes(ext)) {
          try {
            templates[relPath] = fs.readFileSync(fullPath, 'utf-8');
          } catch (error) {
            console.warn(`Warning: Could not read ${relPath}: ${error.message}`);
          }
        }
      }
    }
  }

  scan(dir);
  return templates;
}

/**
 * Load embedded templates (with dev mode instant refresh)
 */
export async function loadEmbeddedTemplates() {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.THYPRESS_USE_DISK_TEMPLATES !== 'false';
  const templatesDir = path.join(__dirname, '../templates/.default');

  // Dev mode with instant refresh
  if (isDev && fs.existsSync(templatesDir)) {
    try {
      if (!hasLoggedDevMode) {
        console.log(info('Dev mode: Loading templates from disk (instant refresh enabled)'));
        hasLoggedDevMode = true;
      }
      return loadTemplatesFromDisk(templatesDir);
    } catch (error) {
      console.log(warning('Failed to load from disk, falling back to embedded'));
    }
  }

  // Production/Compiled: Use static import (works in exe)
  if (STATIC_EMBEDDED_TEMPLATES && Object.keys(STATIC_EMBEDDED_TEMPLATES).length > 0) {
    return STATIC_EMBEDDED_TEMPLATES;
  }

  // Fallback: This should never happen if prebuild ran correctly
  throw new Error(
    'Embedded templates not found.\n' +
    'This executable was built incorrectly.\n' +
    'Rebuild with: bun run build:exe'
  );
}

// ============================================================================
// PHASE 2A: DYNAMIC SINGLE-FILE THEME DETECTION
// ============================================================================

/**
 * Detect which page types a single-file theme can handle
 * Uses multiple detection layers to infer capabilities
 *
 * @param {string} templateSource - Raw template HTML source
 * @param {object} metadata - Theme metadata (from theme.json or front-matter)
 * @returns {Set<string>} - Set of page types this template can handle
 */
function detectSingleFilePageTypes(templateSource, metadata = {}) {
  const detected = new Set();

  // ========================================================================
  // LAYER 1: Explicit declaration in metadata.handles
  // ========================================================================
  if (metadata.handles && Array.isArray(metadata.handles)) {
    metadata.handles.forEach(type => detected.add(type));
    console.log(dim(`Explicit page types from metadata: ${Array.from(detected).join(', ')}`));
    return detected;
  }

  // ========================================================================
  // LAYER 2: Handlebars inline partials
  // Look for {{#*inline "entry"}}, {{#*inline "index"}}, etc.
  // ========================================================================
  const inlinePartialRegex = /\{\{#\*inline\s+"([^"]+)"\}\}/g;
  let match;
  while ((match = inlinePartialRegex.exec(templateSource)) !== null) {
    const partialName = match[1];
    if (['entry', 'index', 'tag', 'category', 'series', '404'].includes(partialName)) {
      detected.add(partialName);
    }
  }
  if (detected.size > 0) {
    console.log(dim(`Detected inline partials: ${Array.from(detected).join(', ')}`));
  }

  // ========================================================================
  // LAYER 3: Conditional pageType checks
  // Look for {{#if (eq pageType "entry")}} patterns
  // ========================================================================
  const conditionalRegex = /\(eq\s+pageType\s+['"]([^'"]+)['"]\)/g;
  while ((match = conditionalRegex.exec(templateSource)) !== null) {
    const pageType = match[1];
    if (['entry', 'index', 'tag', 'category', 'series', '404'].includes(pageType)) {
      detected.add(pageType);
    }
  }
  if (detected.size > 0) {
    console.log(dim(`Detected conditional checks: ${Array.from(detected).join(', ')}`));
  }

  // ========================================================================
  // LAYER 4: Implicit detection from template patterns
  // ========================================================================
  // Check for {{entry}} usage
  if (templateSource.includes('{{#if entry}}') || templateSource.match(/\{\{entry\./)) {
    detected.add('entry');
  }

  // Check for {{entries}} usage (indicates list pages)
  if (templateSource.includes('{{#each entries}}') || templateSource.includes('{{#if entries}}')) {
    detected.add('index');
    detected.add('tag');
    detected.add('category');
    detected.add('series');
  }

  // Specific taxonomy detection
  if (templateSource.includes('{{#if tag}}') || templateSource.match(/\{\{tag\}\}/)) {
    detected.add('tag');
  }
  if (templateSource.includes('{{#if category}}') || templateSource.match(/\{\{category\}\}/)) {
    detected.add('category');
  }
  if (templateSource.includes('{{#if series}}') || templateSource.match(/\{\{series\}\}/)) {
    detected.add('series');
  }

  // ========================================================================
  // LAYER 5: Default fallback if nothing detected
  // ========================================================================
  if (detected.size === 0) {
    detected.add('entry');
    detected.add('index');
    console.log(dim('No explicit detection - defaulting to entry + index'));
  } else {
    console.log(dim(`Implicit detection found: ${Array.from(detected).join(', ')}`));
  }

  return detected;
}

// ============================================================================
// THEME LOADER
// ============================================================================

/**
 * Load theme with support for single-file themes and strict isolation
 *
 * PHASE 2B: Dynamic single-file theme detection
 * - Replaces hardcoded registration with intelligent detection
 * - Analyzes template content to determine which page types it can handle
 * - Uses detectSingleFilePageTypes() for multi-layer inference
 */
export async function loadTheme(themeName = null, siteConfig = {}) {
  const templatesDir = path.join(process.cwd(), 'templates');
  const templatesCache = new Map();
  const themeAssets = new Map();

  let activeTheme = themeName;
  let themeMetadata = {};

  // Auto-detect theme if not specified
  if (!activeTheme) {
    if (fs.existsSync(templatesDir)) {
      const themes = fs.readdirSync(templatesDir)
        .filter(f => {
          const fullPath = path.join(templatesDir, f);
          return !shouldIgnore(f) && fs.statSync(fullPath).isDirectory();
        });
    }
  }

  function compileTemplate(name, content) {
    try {
      return Handlebars.compile(content);
    } catch (error) {
      console.error(errorMsg(`Failed to compile template '${name}': ${error.message}`));
      return null;
    }
  }

  // ========================================================================
  // Load embedded templates (base layer unless strictThemeIsolation)
  // ========================================================================
  const EMBEDDED_TEMPLATES = await loadEmbeddedTemplates();

  const intentMode = process.env.THYPRESS_INTENT_MODE || null;
  const strictIsolation = siteConfig.strictThemeIsolation === true;

  if (!strictIsolation || !activeTheme || activeTheme === '.default') {
    console.log(info('Loading embedded default templates as base layer...'));

    let templatesLoaded = 0;

    for (const [name, content] of Object.entries(EMBEDDED_TEMPLATES)) {
      if (name.endsWith('.html')) {
        const templateName = name.replace('.html', '');

        if (name.startsWith('_')) {
          Handlebars.registerPartial(templateName, content);
          console.log(dim(`Registered partial: ${templateName}`));
        } else {
          const compiled = compileTemplate(templateName, content);
          if (compiled) {
            templatesCache.set(templateName, compiled);
            templatesLoaded++;
          }
        }
      }
    }

    console.log(success(`Loaded ${templatesLoaded} embedded templates`));

    if (intentMode === 'viewer' && !activeTheme) {
      console.log(dim('Using embedded theme for quick viewing'));
    }
  }

  let themePath = null;

  // ========================================================================
  // Load user theme if specified
  // ========================================================================
  if (activeTheme && activeTheme !== '.default') {
    themePath = path.join(templatesDir, activeTheme);

    if (fs.existsSync(themePath)) {
      console.log(success(`Loading theme: ${activeTheme}`));

      // Load theme metadata (theme.json or index.html front-matter)
      const themeJsonPath = path.join(themePath, 'theme.json');
      const indexHtmlPath = path.join(themePath, 'index.html');

      if (fs.existsSync(themeJsonPath)) {
        try {
          themeMetadata = JSON.parse(fs.readFileSync(themeJsonPath, 'utf-8'));
          console.log(dim(`Loaded metadata from theme.json`));
        } catch (error) {
          console.log(warning(`Could not parse theme.json: ${error.message}`));
        }
      } else if (fs.existsSync(indexHtmlPath)) {
        try {
          const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8');
          const { data: frontMatter } = matter(indexContent);

          if (Object.keys(frontMatter).length > 0 && (frontMatter.name || frontMatter.version || frontMatter.requires)) {
            themeMetadata = frontMatter;
            console.log(dim(`Loaded metadata from index.html front-matter`));
          }
        } catch (error) {
          // Silently ignore
        }
      }

      // Load partials from partials/ folder
      const partialsDir = path.join(themePath, 'partials');
      if (fs.existsSync(partialsDir)) {
        function scanPartialsFolder(dir, relativePath = '') {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (shouldIgnore(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

            if (entry.isDirectory()) {
              scanPartialsFolder(fullPath, relPath);
            } else if (entry.name.endsWith('.html')) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const partialName = path.basename(relPath, '.html').replace(/\\/g, '/');
              Handlebars.registerPartial(partialName, content);
              console.log(dim(`Registered partial (folder): ${partialName}`));
            }
          }
        }

        scanPartialsFolder(partialsDir);
      }

      // ======================================================================
      // Load theme files recursively
      // ======================================================================
      function loadThemeFiles(dir, relativePath = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (shouldIgnore(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

          if (entry.isDirectory()) {
            if (entry.name === 'partials') continue;
            loadThemeFiles(fullPath, relPath);
          } else {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const ext = path.extname(entry.name).toLowerCase();

            if (ext === '.html') {
              const templateName = path.basename(entry.name, '.html');

              if (entry.name.startsWith('_')) {
                Handlebars.registerPartial(templateName, content);
                console.log(dim(`Registered partial (underscore): ${templateName}`));
              } else {
                const { data: frontMatter, content: templateContent } = matter(content);

                if (frontMatter.partial === true) {
                  Handlebars.registerPartial(templateName, templateContent);
                  console.log(dim(`Registered partial (front matter): ${templateName}`));
                } else {
                  // Validate template syntax before compiling
                  if (!validateTemplate(templateContent, relPath)) {
                    const siteConfig = getSiteConfig();
                    if (siteConfig.strictTemplateValidation !== false) {
                      console.error(errorMsg(`Exiting due to template validation failure`));
                      process.exit(1);
                    }
                    console.log(warning(`Skipping broken template: ${relPath}`));
                    continue;
                  }

                  const compiled = compileTemplate(templateName, templateContent);
                  if (compiled) {
                    templatesCache.set(templateName, compiled);
                  }
                }
              }
            } else {
              const needsTemplating = content.includes('{{') || content.includes('{%');

              if (needsTemplating) {
                const compiled = compileTemplate(relPath, content);
                if (compiled) {
                  themeAssets.set(relPath, { type: 'template', compiled });
                }
              } else {
                themeAssets.set(relPath, { type: 'static', content });
              }
            }
          }
        }
      }

      loadThemeFiles(themePath);

      // ======================================================================
      // PHASE 2B: Dynamic single-file theme detection
      // ======================================================================
      let isSingleFile = false;

      // Method 1: Explicit declaration in metadata
      if (themeMetadata.singleFile === true) {
        isSingleFile = true;
        console.log(info('Single-file theme (explicit)'));
      }
      // Method 2: Auto-detect (only index.html exists at root)
      else if (templatesCache.has('index')) {
        const htmlFiles = fs.readdirSync(themePath)
          .filter(f => {
            if (!f.endsWith('.html')) return false;
            if (f.startsWith('_')) return false;
            if (f === '404.html') return false;
            return true;
          });

        if (htmlFiles.length === 1 && htmlFiles[0] === 'index.html') {
          isSingleFile = true;
          console.log(info('Single-file theme (auto-detected)'));
        }
      }

      // ======================================================================
      // PHASE 2B: Replace hardcoded registration with dynamic detection
      // ======================================================================
      if (isSingleFile) {
        const indexTpl = templatesCache.get('index');
        if (indexTpl) {
          // Read the raw template source for analysis
          const indexHtmlPath = path.join(themePath, 'index.html');
          let indexSource = '';
          if (fs.existsSync(indexHtmlPath)) {
            indexSource = fs.readFileSync(indexHtmlPath, 'utf-8');
          }

          // Use multi-layer detection to determine capabilities
          const detectedTypes = detectSingleFilePageTypes(indexSource, themeMetadata);

          // Register index template for all detected page types
          detectedTypes.forEach(type => {
            templatesCache.set(type, indexTpl);
          });

          console.log(success(`Single-file theme handles: ${Array.from(detectedTypes).join(', ')}`));

          // Log which types will use embedded fallbacks
          const allTypes = ['entry', 'index', 'tag', 'category', 'series', '404'];
          const unhandled = allTypes.filter(t => !detectedTypes.has(t));
          if (unhandled.length > 0) {
            console.log(dim(`Using embedded defaults for: ${unhandled.join(', ')}`));
          }
        }
      }
    }
  }

  console.log(success(`Loaded ${templatesCache.size} templates`));

  // Validate theme
  let validation = { valid: true, errors: [], warnings: [] };

  if (activeTheme && activeTheme !== '.default' && themePath) {
    validation = validateTheme(themePath, templatesCache, activeTheme, themeMetadata);
  }

  return { templatesCache, themeAssets, activeTheme, validation, themeMetadata };
}

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

/**
 * Select appropriate template for entry
 */
export function selectTemplate(entry, templates, defaultTemplate = 'entry') {
  // Explicit template override in front-matter
  if (entry.frontMatter && entry.frontMatter.template) {
    const explicitTemplate = templates.get(entry.frontMatter.template);
    if (explicitTemplate) {
      return explicitTemplate;
    }
  }

  // Folder-based template selection (content/docs/ → docs.html)
  if (entry.section) {
    const sectionTemplate = templates.get(entry.section);
    if (sectionTemplate) {
      return sectionTemplate;
    }
  }

  // Homepage special case
  if (entry.slug === 'index' || entry.slug === '') {
    const indexTemplate = templates.get('index');
    if (indexTemplate) return indexTemplate;
  }

  // Default fallback
  return templates.get(defaultTemplate)
      || templates.get('entry')
      || templates.get('page')
      || templates.get('index');
}
