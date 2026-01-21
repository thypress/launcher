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
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import matter from 'gray-matter';
import { success, error as errorMsg, warning, info, dim } from './utils/colors.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Register Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('split', (str, sep, index) => String(str).split(sep)[index]);

// Handlebars.registerHelper('multiply', (a, b) => a * b);

// THYPRESS Feature Registry - what the runtime provides to templates
export const THYPRESS_FEATURES = {
  // Core variables (always available)
  navigation: { since: '0.1.0', type: 'core', description: 'Site navigation tree' },
  entry: { since: '0.3.0', type: 'core', description: 'Single entry object with HTML, title, etc' },
  siteTitle: { since: '0.1.0', type: 'core', description: 'Site title from config' },
  siteDescription: { since: '0.1.0', type: 'core', description: 'Site description from config' },
  siteUrl: { since: '0.1.0', type: 'core', description: 'Site URL from config' },
  author: { since: '0.1.0', type: 'core', description: 'Site author from config' },

  // Content metadata
  title: { since: '0.1.0', type: 'content', description: 'Page/page title' },
  date: { since: '0.1.0', type: 'content', description: 'Page date' },
  createdAt: { since: '0.1.0', type: 'content', description: 'Page creation date' },
  updatedAt: { since: '0.1.0', type: 'content', description: 'Page last updated date' },
  description: { since: '0.1.0', type: 'content', description: 'Page description/excerpt' },
  slug: { since: '0.1.0', type: 'content', description: 'Page URL slug' },
  url: { since: '0.1.0', type: 'content', description: 'Page full URL path' },

  // Features
  tags: { since: '0.1.0', type: 'feature', description: 'Entry tags array' },
  toc: { since: '0.1.0', type: 'feature', description: 'Table of content from headings' },
  pagination: { since: '0.1.0', type: 'feature', description: 'Pagination data for lists' },
  entries: { since: '0.3.0', type: 'feature', description: 'Entries list (on index/tag pages)' },
  tag: { since: '0.1.0', type: 'feature', description: 'Current tag (on tag pages)' },

  // Advanced features (v0.2.0+)
  categories: { since: '0.2.0', type: 'feature', description: 'Page categories array' },
  series: { since: '0.2.0', type: 'feature', description: 'Page series name' },
  category: { since: '0.2.0', type: 'feature', description: 'Current category (on category pages)' },
  relatedEntries: { since: '0.2.0', type: 'feature', description: 'Related pages based on tags' },
  prevEntry: { since: '0.2.0', type: 'navigation', description: 'Previous page in chronological order' },
  nextEntry: { since: '0.2.0', type: 'navigation', description: 'Next page in chronological order' },
  wordCount: { since: '0.2.0', type: 'content', description: 'Word count for reading time' },
  readingTime: { since: '0.2.0', type: 'content', description: 'Estimated reading time in minutes' },
  ogImage: { since: '0.2.0', type: 'content', description: 'Open Graph image URL' },

  // Context flags
  hasEntriesList: { since: '0.3.0', type: 'context', description: 'True if page shows entries list' },
  showToc: { since: '0.2.0', type: 'context', description: 'True if TOC should be displayed' }
};

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

/**
 * Check if content has specific features
 */
function hasCategories(contentCache) {
  for (const content of contentCache.values()) {
    if (content.categories && content.categories.length > 0) {
      return true;
    }
  }
  return false;
}

function hasSeries(contentCache) {
  for (const content of contentCache.values()) {
    if (content.series) {
      return true;
    }
  }
  return false;
}

function hasContentWithHeadings(contentCache) {
  for (const content of contentCache.values()) {
    if (content.headings && content.headings.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Validate theme requirements against THYPRESS runtime
 */
export function validateThemeRequirements(themeMetadata, thypressVersion, contentCache, themePath) {
  const warnings = [];
  const errors = [];

  const requires = themeMetadata.requires || [];

  for (const required of requires) {
    const feature = THYPRESS_FEATURES[required];

    if (!feature) {
      warnings.push({
        type: 'unknown-feature',
        feature: required,
        message: `Theme requires unknown feature '${required}' - may not work correctly`
      });
      continue;
    }

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

    if (feature.type === 'feature' && contentCache) {
      if (required === 'categories' && !hasCategories(contentCache)) {
        warnings.push({
          type: 'content-missing',
          feature: required,
          message: `Theme uses categories, but no content has categories defined`
        });
      }

      if (required === 'series' && !hasSeries(contentCache)) {
        warnings.push({
          type: 'content-missing',
          feature: required,
          message: `Theme uses series, but no content has series defined`
        });
      }

      if (required === 'toc' && !hasContentWithHeadings(contentCache)) {
        warnings.push({
          type: 'content-missing',
          feature: required,
          message: `Theme uses table of contents, but no content has headings`
        });
      }
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
      thypressVersion,
      null,
      themePath
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
    active: false
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
      active: false
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
          preview: themeData.preview,
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
            preview: frontMatter.preview,
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

// FIX 2: Module-level flag for dev mode logging
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
  const embeddedPath = path.join(__dirname, 'embedded-templates.js');

  // FIX 2: Dev mode with quiet logging
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

  // Production: Use embedded templates
  if (fs.existsSync(embeddedPath)) {
    if (isEmbeddedTemplatesStale(embeddedPath)) {
      console.log(warning('Embedded templates may be outdated'));
      console.log(dim('  Run: bun src/embed-templates.js'));
    }

    const { EMBEDDED_TEMPLATES } = await import('./embedded-templates.js');
    return EMBEDDED_TEMPLATES;
  }

  // Auto-generate if missing
  const autoGenerateDisabled = process.env.DISABLE_AUTOGEN_TEMPLATE === 'true';

  if (autoGenerateDisabled) {
    throw new Error(
      'embedded-templates.js not found and auto-generation is disabled.\n' +
      'Please pre-generate templates during build:\n' +
      '  bun src/embed-templates.js'
    );
  }

  if (!canWriteToSrcDir()) {
    throw new Error(
      'embedded-templates.js not found and cannot write to src/ directory.\n' +
      'Please pre-generate templates during build:\n' +
      '  bun src/embed-templates.js'
    );
  }

  console.log(info('Embedded templates not found, generating...'));

  try {
    const embedScriptPath = path.join(__dirname, 'embed-templates.js');
    await import(embedScriptPath);
    console.log(success('Embedded templates generated'));
  } catch (genError) {
    throw new Error(
      `Failed to generate embedded templates: ${genError.message}\n` +
      'Try running manually: bun src/embed-templates.js'
    );
  }

  const { EMBEDDED_TEMPLATES } = await import('./embedded-templates.js');
  return EMBEDDED_TEMPLATES;
}

/**
 * Load theme with support for single-file themes and strict isolation
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

      // TODO: improve automatic theme sorting
      /*if (themes.length === 1) {
        activeTheme = themes[0];
      } else*/
      // if (themes.includes('my-press')) {
      //   activeTheme = 'my-press';
      // }
      // Don't auto-pick other themes - let it fall back to .default
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

  // Load embedded templates (base layer unless strictThemeIsolation)
  const EMBEDDED_TEMPLATES = await loadEmbeddedTemplates();

  // Strict isolation mode: skip embedded loading if user theme specified
  const strictIsolation = siteConfig.strictThemeIsolation === true;

  if (!strictIsolation || !activeTheme || activeTheme === '.default') {
    for (const [name, content] of Object.entries(EMBEDDED_TEMPLATES)) {
      if (name.endsWith('.html')) {
        const templateName = name.replace('.html', '');

        if (name.startsWith('_')) {
          Handlebars.registerPartial(templateName, content);
        } else {
          const compiled = compileTemplate(templateName, content);
          if (compiled) {
            templatesCache.set(templateName, compiled);
          }
        }
      }
    }
  }

  let themePath = null;

  // Load user theme if specified
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
          console.log(dim(`  Loaded metadata from theme.json`));
        } catch (error) {
          console.log(warning(`  Could not parse theme.json: ${error.message}`));
        }
      } else if (fs.existsSync(indexHtmlPath)) {
        try {
          const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8');
          const { data: frontMatter } = matter(indexContent);

          if (Object.keys(frontMatter).length > 0 && (frontMatter.name || frontMatter.version || frontMatter.requires)) {
            themeMetadata = frontMatter;
            console.log(dim(`  Loaded metadata from index.html front-matter`));
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
              console.log(dim(`  Registered partial (folder): ${partialName}`));
            }
          }
        }

        scanPartialsFolder(partialsDir);
      }

      // Load theme files recursively
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
                console.log(dim(`  Registered partial (underscore): ${templateName}`));
              } else {
                const { data: frontMatter, content: templateContent } = matter(content);

                if (frontMatter.partial === true) {
                  Handlebars.registerPartial(templateName, templateContent);
                  console.log(dim(`  Registered partial (front matter): ${templateName}`));
                } else {
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

      // FIX 1: Detect single-file theme
      let isSingleFile = false;

      // Method 1: Explicit declaration in metadata
      if (themeMetadata.singleFile === true) {
        isSingleFile = true;
        console.log(info('  Single-file theme (explicit)'));
      }
      // Method 2: Auto-detect (only index.html exists at root)
      else if (templatesCache.has('index')) {
        const htmlFiles = fs.readdirSync(themePath)
          .filter(f => {
            if (!f.endsWith('.html')) return false;
            if (f.startsWith('_')) return false;  // Exclude partials
            if (f === '404.html') return false;    // Exclude 404
            return true;
          });

        if (htmlFiles.length === 1 && htmlFiles[0] === 'index.html') {
          isSingleFile = true;
          console.log(info('  Single-file theme (auto-detected)'));
        }
      }

      // Register index template for all page types
      if (isSingleFile) {
        const indexTpl = templatesCache.get('index');
        if (indexTpl) {
          ['entry', 'tag', 'category', 'series'].forEach(type => {
            templatesCache.set(type, indexTpl);
          });
          console.log(dim('  Registered index.html for all page types'));
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
