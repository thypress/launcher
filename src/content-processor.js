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

import MarkdownIt from 'markdown-it';
import markdownItHighlight from 'markdown-it-highlightjs';
import markdownItAnchor from 'markdown-it-anchor';
import matter from 'gray-matter';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseDocument } from 'htmlparser2';
import { success, error as errorMsg, warning, info, dim } from './utils/colors.js';
import { slugify, normalizeToWebPath, getSiteConfig } from './utils/taxonomy.js';

// Markdown-it setup
const md = new MarkdownIt();
md.use(markdownItHighlight);
md.use(markdownItAnchor, {
  permalink: false,
  slugify: (s) => slugify(s)
});

// Standard responsive image sizes
const STANDARD_IMAGE_SIZES = [400, 800, 1200];

// Default directories to skip in content detection
const DEFAULT_SKIP_DIRS = [
  'node_modules',
  'src',
  'templates',
  '.git',
  'build',
  'dist',
  '.cache',
  '.next',
  'vendor',
  '.vscode',
  '.idea',
  'coverage',
  'test',
  'tests',
  '__tests__'
];

function shouldIgnore(name) {
  return name.startsWith('.');
}

function isInDraftsFolder(relativePath) {
  return relativePath
    .split(/[\\/]+/)
    .some(p => p.toLowerCase() === 'drafts');
}

/**
 * HTML escape for text files
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Detect if HTML content is a complete document
 */
function isCompleteHtmlDocument(htmlContent) {
  try {
    const dom = parseDocument(htmlContent);

    return dom.children.some(node => {
      if (node.type === 'directive' && node.name === '!doctype') {
        return true;
      }

      if (node.type === 'tag') {
        const structuralTags = ['html', 'head', 'body'];
        return structuralTags.includes(node.name.toLowerCase());
      }

      return false;
    });
  } catch {
    const cleaned = htmlContent.trim()
      .replace(/^<\?xml[^>]*>\s*/i, '')
      .replace(/^<!--[\s\S]*?-->\s*/g, '');

    return /^<!DOCTYPE\s+html/i.test(cleaned) ||
          /<(html|head|body)[\s>]/i.test(cleaned);
  }
}

/**
 * Detect HTML intent (raw vs templated)
 */
function detectHtmlIntent(htmlContent, frontMatter) {
  if (frontMatter.template === 'none' || frontMatter.template === false) {
    return { mode: 'raw' };
  }

  if (frontMatter.template) {
    return { mode: 'templated' };
  }

  if (isCompleteHtmlDocument(htmlContent)) {
    return { mode: 'raw' };
  }

  return { mode: 'templated' };
}

/**
 * Extract text content from HTML node recursively
 */
function extractTextContent(node) {
  if (node.type === 'text') return node.data;
  if (node.children) {
    return node.children.map(extractTextContent).join('');
  }
  return '';
}

/**
 * Extract headings from HTML content
 */
function extractHeadingsFromHtml(htmlContent) {
  const headings = [];

  try {
    const dom = parseDocument(htmlContent);

    function traverse(node) {
      if (node.type === 'tag' && /^h[1-6]$/i.test(node.name)) {
        const level = parseInt(node.name.substring(1));
        const content = extractTextContent(node).trim();
        const slug = node.attribs?.id || '';

        if (content) {
          headings.push({ level, content, slug });
        }
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    traverse(dom);
  } catch (error) {
    console.error(errorMsg(`Error extracting headings from HTML: ${error.message}`));
  }

  return headings;
}

/**
 * Build hierarchical TOC structure from flat headings array
 */
export function buildTocStructure(headings, minLevel = 2, maxLevel = 4) {
  if (!headings || headings.length === 0) return [];

  const toc = [];
  const stack = [{ children: toc, level: 0 }];

  for (const heading of headings) {
    if (heading.level < minLevel || heading.level > maxLevel) continue;
    if (!heading.slug) continue;

    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const item = {
      level: heading.level,
      content: heading.content,
      slug: heading.slug,
      children: []
    };

    stack[stack.length - 1].children.push(item);
    stack.push(item);
  }

  return toc;
}

/**
 * Setup heading extractor for markdown-it
 */
function setupHeadingExtractor(md) {
  const originalHeadingOpen = md.renderer.rules.heading_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.heading_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const level = parseInt(token.tag.substring(1));
    const nextToken = tokens[idx + 1];
    const content = nextToken && nextToken.type === 'inline' ? nextToken.content : '';
    const slug = token.attrGet('id') || '';

    if (!env.headings) env.headings = [];
    env.headings.push({ level, content, slug });

    return originalHeadingOpen(tokens, idx, options, env, self);
  };
}

setupHeadingExtractor(md);

/**
 * Setup admonitions/callouts for markdown-it
 */
function setupAdmonitions(md) {
  const admonitionTypes = {
    'note': { icon: 'ℹ️', class: 'admonition-note' },
    'tip': { icon: '💡', class: 'admonition-tip' },
    'warning': { icon: '⚠️', class: 'admonition-warning' },
    'danger': { icon: '🚨', class: 'admonition-danger' },
    'info': { icon: 'ℹ️', class: 'admonition-info' }
  };

  md.block.ruler.before('fence', 'admonition', function(state, startLine, endLine, silent) {
    const marker = ':::';
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];

    if (pos + 3 > max) return false;
    if (state.src.slice(pos, pos + 3) !== marker) return false;

    const typeMatch = state.src.slice(pos + 3, max).trim().toLowerCase();
    if (!admonitionTypes[typeMatch]) return false;

    if (silent) return true;

    let nextLine = startLine;
    let autoClosed = false;

    while (nextLine < endLine) {
      nextLine++;
      if (nextLine >= endLine) break;

      const linePos = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineMax = state.eMarks[nextLine];

      if (linePos < lineMax && state.sCount[nextLine] < state.blkIndent) break;

      if (state.src.slice(linePos, linePos + 3) === marker) {
        autoClosed = true;
        break;
      }
    }

    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;
    state.parentType = 'admonition';

    const token = state.push('admonition_open', 'div', 1);
    token.markup = marker;
    token.block = true;
    token.info = typeMatch;
    token.map = [startLine, nextLine];

    state.md.block.tokenize(state, startLine + 1, nextLine);

    const closeToken = state.push('admonition_close', 'div', -1);
    closeToken.markup = marker;
    closeToken.block = true;

    state.parentType = oldParent;
    state.lineMax = oldLineMax;
    state.line = nextLine + (autoClosed ? 1 : 0);

    return true;
  });

  md.renderer.rules.admonition_open = function(tokens, idx) {
    const token = tokens[idx];
    const type = token.info;
    const config = admonitionTypes[type];
    return `<div class="admonition ${config.class}"><div class="admonition-title">${config.icon} ${type.toUpperCase()}</div><div class="admonition-content">`;
  };

  md.renderer.rules.admonition_close = function() {
    return '</div></div>\n';
  };
}

setupAdmonitions(md);

/**
 * Setup image optimizer for markdown-it
 */
function setupImageOptimizer(md) {
  const defaultRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.image = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    const altIndex = token.attrIndex('alt');

    if (srcIndex < 0) return defaultRender(tokens, idx, options, env, self);

    const src = token.attrs[srcIndex][1];
    const alt = altIndex >= 0 ? token.attrs[altIndex][1] : '';

    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      return defaultRender(tokens, idx, options, env, self);
    }

    const pageRelativePath = env.pageRelativePath || '';
    const contentDir = env.contentDir;

    let resolvedImagePath;
    let outputImagePath;

    if (src.startsWith('/')) {
      resolvedImagePath = path.join(contentDir, src.substring(1));
      outputImagePath = src.substring(1);
    } else if (src.startsWith('./') || src.startsWith('../')) {
      const pageDir = path.dirname(path.join(contentDir, pageRelativePath));
      resolvedImagePath = path.resolve(pageDir, src);
      outputImagePath = path.relative(contentDir, resolvedImagePath);
    } else {
      const pageDir = path.dirname(path.join(contentDir, pageRelativePath));
      resolvedImagePath = path.resolve(pageDir, src);
      outputImagePath = path.relative(contentDir, resolvedImagePath);
    }

    outputImagePath = normalizeToWebPath(outputImagePath);

    const basename = path.basename(resolvedImagePath, path.extname(resolvedImagePath));
    const outputDir = path.dirname(outputImagePath);

    // Security: Validate image is within content directory
    const contentDirResolved = path.resolve(contentDir);
    const imageResolved = path.resolve(resolvedImagePath);
    if (!imageResolved.startsWith(contentDirResolved)) {
      console.log(warning(`Image outside content directory (ignored): ${src}`));
      return `<!-- Image blocked: ${src} -->`;
    }

    const hash = crypto.createHash('md5').update(resolvedImagePath).digest('hex').substring(0, 8);

    const urlBase = outputDir === '.' ? '' : `${outputDir}/`;

    let sizesToGenerate = [...STANDARD_IMAGE_SIZES];

    const imageDimensionsCache = env.imageDimensionsCache || new Map();
    const originalWidth = imageDimensionsCache.get(resolvedImagePath);

    if (originalWidth) {
      sizesToGenerate = STANDARD_IMAGE_SIZES.filter(size => size < originalWidth);
      if (!sizesToGenerate.includes(originalWidth)) {
        sizesToGenerate.push(originalWidth);
      }
      sizesToGenerate.sort((a, b) => a - b);
    }

    if (!env.referencedImages) env.referencedImages = [];
    env.referencedImages.push({
      src,
      resolvedPath: resolvedImagePath,
      outputPath: outputImagePath,
      basename,
      hash,
      urlBase,
      sizesToGenerate
    });

    return `<picture>
  <source
    srcset="${sizesToGenerate.map(size => `/${urlBase}${basename}-${size}-${hash}.webp ${size}w`).join(', ')}"
    type="image/webp"
    sizes="(max-width: ${sizesToGenerate[0]}px) ${sizesToGenerate[0]}px, (max-width: ${sizesToGenerate[Math.floor(sizesToGenerate.length / 2)]}px) ${sizesToGenerate[Math.floor(sizesToGenerate.length / 2)]}px, ${sizesToGenerate[sizesToGenerate.length - 1]}px">
  <source
    srcset="${sizesToGenerate.map(size => `/${urlBase}${basename}-${size}-${hash}.jpg ${size}w`).join(', ')}"
    type="image/jpeg"
    sizes="(max-width: ${sizesToGenerate[0]}px) ${sizesToGenerate[0]}px, (max-width: ${sizesToGenerate[Math.floor(sizesToGenerate.length / 2)]}px) ${sizesToGenerate[Math.floor(sizesToGenerate.length / 2)]}px, ${sizesToGenerate[sizesToGenerate.length - 1]}px">
  <img
    src="/${urlBase}${basename}-${sizesToGenerate[Math.floor(sizesToGenerate.length / 2)]}-${hash}.jpg"
    alt="${alt}"
    loading="lazy"
    decoding="async">
</picture>`;
  };
}

setupImageOptimizer(md);

/**
 * Optimize image to multiple sizes and formats
 */
export async function optimizeImage(imagePath, outputDir, sizesToGenerate = STANDARD_IMAGE_SIZES) {
  const ext = path.extname(imagePath);
  const name = path.basename(imagePath, ext);
  const hash = crypto.createHash('md5').update(imagePath).digest('hex').substring(0, 8);

  if (!sizesToGenerate || sizesToGenerate.length === 0) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const originalWidth = metadata.width;

      sizesToGenerate = STANDARD_IMAGE_SIZES.filter(size => size < originalWidth);

      if (!sizesToGenerate.includes(originalWidth)) {
        sizesToGenerate.push(originalWidth);
      }
      sizesToGenerate.sort((a, b) => a - b);
    } catch (error) {
      sizesToGenerate = STANDARD_IMAGE_SIZES;
    }
  }

  const optimized = [];

  try {
    for (const size of sizesToGenerate) {
      const webpFilename = `${name}-${size}-${hash}.webp`;
      const webpPath = path.join(outputDir, webpFilename);
      await sharp(imagePath)
        .resize(size, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .webp({ quality: 80, effort: 6 })
        .toFile(webpPath);
      optimized.push({ format: 'webp', size, filename: webpFilename });

      const jpegFilename = `${name}-${size}-${hash}.jpg`;
      const jpegPath = path.join(outputDir, jpegFilename);
      await sharp(imagePath)
        .resize(size, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 80, progressive: true, mozjpeg: true })
        .toFile(jpegPath);
      optimized.push({ format: 'jpeg', size, filename: jpegFilename });
    }
  } catch (error) {
    console.error(`Error optimizing ${imagePath}:`, error.message);
  }

  return optimized;
}

/**
 * Calculate reading statistics
 */
function calculateReadingStats(content, siteConfig = {}) {
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[#*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = plainText.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerMinute = siteConfig.readingSpeed || 200;
  const readingTime = Math.ceil(words / wordsPerMinute);

  return { wordCount: words, readingTime };
}

/**
 * Extract title from markdown content
 */
export function extractTitleFromContent(content, isMarkdown) {
  if (!isMarkdown) return null;
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  return null;
}

/**
 * Extract date from filename
 */
export function extractDateFromFilename(filename) {
  const basename = path.basename(filename);
  const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  return null;
}

/**
 * Check if birthtime is valid
 */
function isValidBirthtime(stats) {
  const birthtime = stats.birthtime.getTime();
  const ctime = stats.ctime.getTime();
  const mtime = stats.mtime.getTime();

  if (birthtime <= 0) return false;
  if (birthtime === ctime) return false;
  if (birthtime > mtime) return false;

  return true;
}

/**
 * Process page metadata
 */
export function processPageMetadata(content, filename, frontMatter, isMarkdown, fullPath, siteConfig = {}) {
  const stats = fs.statSync(fullPath);

  let title = frontMatter.title;

  if (!title) {
    title = extractTitleFromContent(content, isMarkdown);
  }

  if (!title) {
    const basename = path.basename(filename);
    title = basename
      .replace(/\.(md|txt|html)$/, '')
      .replace(/^\d{4}-\d{2}-\d{2}-/, '')
      .replace(/[-_]/g, ' ')
      .trim();
  }

  if (!title) {
    title = path.basename(filename).replace(/\.(md|txt|html)$/, '');
  }

  let createdAt = frontMatter.createdAt || frontMatter.date;

  if (!createdAt) {
    createdAt = extractDateFromFilename(filename);
  }

  if (!createdAt) {
    if (isValidBirthtime(stats)) {
      createdAt = stats.birthtime.toISOString().split('T')[0];
    }
  }

  if (!createdAt) {
    createdAt = stats.mtime.toISOString().split('T')[0];
  }

  let updatedAt = frontMatter.updatedAt || frontMatter.updated;

  if (!updatedAt) {
    updatedAt = stats.mtime.toISOString().split('T')[0];
  }

  if (createdAt instanceof Date) {
    createdAt = createdAt.toISOString().split('T')[0];
  }

  if (updatedAt instanceof Date) {
    updatedAt = updatedAt.toISOString().split('T')[0];
  }

  const { wordCount, readingTime } = calculateReadingStats(content, siteConfig);

  return { title, createdAt, updatedAt, wordCount, readingTime };
}

/**
 * Extract taxonomies from front-matter
 */
function extractTaxonomies(frontMatter) {
  const taxonomies = {};

  if (frontMatter.categories) {
    taxonomies.categories = Array.isArray(frontMatter.categories)
      ? frontMatter.categories
      : [frontMatter.categories];
  }

  if (frontMatter.series) {
    taxonomies.series = frontMatter.series;
  }

  return taxonomies;
}

/**
 * Generate URL from relative path
 */
export function generateUrl(relativePath) {
  let url = relativePath.replace(/\.(md|txt|html)$/, '');
  url = url.replace(/\/index$/, '');
  return '/' + url + (url ? '/' : '');
}

/**
 * Process a single content file
 */
export function processContentFile(fullPath, relativePath, mode, contentDir, siteConfig = {}, cachedContent = null) {
  const ext = path.extname(fullPath).toLowerCase();
  const isMarkdown = ext === '.md';
  const isText = ext === '.txt';
  const isHtml = ext === '.html';

  const webPath = normalizeToWebPath(relativePath);

  // HTML files
  if (isHtml) {
    const rawHtml = fs.readFileSync(fullPath, 'utf-8');
    const { data: frontMatter, content: htmlContent } = matter(rawHtml);

    if (frontMatter.draft === true) {
      return null;
    }

    let url;
    if (frontMatter.permalink) {
      url = frontMatter.permalink;
      if (!url.startsWith('/')) url = '/' + url;
      if (!url.endsWith('/')) url = url + '/';
      console.log(dim(`  Using permalink: ${url} (${relativePath})`));
    } else {
      url = generateUrl(webPath);
    }

    const slug = url.substring(1).replace(/\/$/, '') || 'index';

    const intent = detectHtmlIntent(htmlContent, frontMatter);

    let section = null;
    if (mode === 'structured') {
      const parts = webPath.split('/');
      section = parts.length > 1 ? parts[0] : null;
    }

    let toc = [];
    let headings = [];
    if (intent.mode === 'templated') {
      headings = extractHeadingsFromHtml(htmlContent);
      toc = buildTocStructure(headings);
    }

    const taxonomies = extractTaxonomies(frontMatter);

    return {
      slug,
      entry: {
        filename: webPath,
        slug: slug,
        url: url,
        title: frontMatter.title || path.basename(fullPath, '.html'),
        date: fs.statSync(fullPath).mtime.toISOString().split('T')[0],
        createdAt: frontMatter.createdAt || fs.statSync(fullPath).mtime.toISOString().split('T')[0],
        updatedAt: frontMatter.updatedAt || fs.statSync(fullPath).mtime.toISOString().split('T')[0],
        tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : (frontMatter.tags ? [frontMatter.tags] : []),
        description: frontMatter.description || '',
        html: htmlContent,
        renderedHtml: intent.mode === 'raw' ? htmlContent : null,
        frontMatter: frontMatter,
        relativePath: webPath,
        ogImage: frontMatter.image || null,
        type: 'html',
        wordCount: 0,
        readingTime: 0,
        section: section,
        toc: toc,
        headings: headings,
        ...taxonomies
      },
      imageReferences: []
    };
  }

  // Markdown/Text files
  const rawContent = cachedContent || fs.readFileSync(fullPath, 'utf-8');
  const { data: frontMatter, content } = matter(rawContent);

  if (frontMatter.draft === true) {
    return null;
  }

  let url;
  if (frontMatter.permalink) {
    url = frontMatter.permalink;
    if (!url.startsWith('/')) url = '/' + url;
    if (!url.endsWith('/')) url = url + '/';
    console.log(dim(`  Using permalink: ${url} (${relativePath})`));
  } else {
    url = generateUrl(webPath);
  }

  const slug = url.substring(1).replace(/\/$/, '') || 'index';

  const env = {
    pageRelativePath: webPath,
    referencedImages: [],
    contentDir: contentDir,
    headings: []
  };

  const renderedHtml = isMarkdown
    ? md.render(content, env)
    : siteConfig.escapeTextFiles !== false
      ? `<pre>${escapeHtml(content)}</pre>`
      : `<pre>${content}</pre>`;

  const { title, createdAt, updatedAt, wordCount, readingTime } = processPageMetadata(
    content,
    path.basename(fullPath),
    frontMatter,
    isMarkdown,
    fullPath,
    siteConfig
  );

  const tags = Array.isArray(frontMatter.tags) ? frontMatter.tags : (frontMatter.tags ? [frontMatter.tags] : []);
  const description = frontMatter.description || '';

  let section = null;
  if (mode === 'structured') {
    const parts = webPath.split('/');
    section = parts.length > 1 ? parts[0] : null;
  }

  let ogImage = frontMatter.image || null;
  if (!ogImage && env.referencedImages.length > 0) {
    const firstImg = env.referencedImages[0];
    const ogSize = firstImg.sizesToGenerate[Math.floor(firstImg.sizesToGenerate.length / 2)] || 800;
    ogImage = `/${firstImg.urlBase}${firstImg.basename}-${ogSize}-${firstImg.hash}.jpg`;
  }

  const toc = isMarkdown ? buildTocStructure(env.headings) : [];

  const taxonomies = extractTaxonomies(frontMatter);

  return {
    slug,
    entry: {
      filename: webPath,
      slug: slug,
      url: url,
      title: title,
      date: createdAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
      tags: tags,
      description: description,
      html: renderedHtml,
      rawContent: content,
      frontMatter: frontMatter,
      relativePath: webPath,
      ogImage: ogImage,
      wordCount: wordCount,
      readingTime: readingTime,
      section: section,
      type: isMarkdown ? 'markdown' : 'text',
      toc: toc,
      headings: env.headings,
      ...taxonomies
    },
    imageReferences: env.referencedImages
  };
}

/**
 * Detect content structure and root
 */
export function detectContentStructure(workingDir, options = {}) {
  const { cliContentDir = null, cliSkipDirs = null } = options;

  if (cliContentDir) {
    const cliDir = path.join(workingDir, cliContentDir);
    if (fs.existsSync(cliDir) && fs.statSync(cliDir).isDirectory()) {
      console.log(success(`Using CLI-specified content directory: ${cliContentDir}`));
      return {
        contentRoot: cliDir,
        mode: 'structured',
        customDir: cliContentDir
      };
    } else {
      console.log(errorMsg(`CLI content directory not found: ${cliContentDir}`));
      process.exit(1);
    }
  }

  let config = {};
  try {
    config = getSiteConfig();
    if (config.contentDir) {
      const configDir = path.join(workingDir, config.contentDir);
      if (!fs.existsSync(configDir) || !fs.statSync(configDir).isDirectory()) {
        console.log(errorMsg(`Configured contentDir not found: ${config.contentDir}`));
        console.log(info('Please create the directory or update config.json'));
        process.exit(1);
      }
      console.log(success(`Using configured content directory: ${config.contentDir}`));
      return {
        contentRoot: configDir,
        mode: 'structured',
        customDir: config.contentDir
      };
    }
  } catch (error) {
    // No config file
  }

  const contentDir = path.join(workingDir, 'content');
  if (fs.existsSync(contentDir) && fs.statSync(contentDir).isDirectory()) {
    return {
      contentRoot: contentDir,
      mode: 'structured'
    };
  }

  let skipDirs = [...DEFAULT_SKIP_DIRS];

  if (cliSkipDirs) {
    skipDirs = [...skipDirs, ...cliSkipDirs];
  }

  if (config.skipDirs && Array.isArray(config.skipDirs)) {
    skipDirs = [...skipDirs, ...config.skipDirs];
  }

  skipDirs = [...new Set(skipDirs)];

  const hasSkippedDirs = skipDirs.some(dir => {
    const dirPath = path.join(workingDir, dir);
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  });

  if (!hasSkippedDirs) {
    try {
      const files = fs.readdirSync(workingDir);
      const contentFiles = files.filter(f => {
        if (shouldIgnore(f)) return false;
        const fullPath = path.join(workingDir, f);
        if (!fs.statSync(fullPath).isFile()) return false;
        return /\.(md|txt|html)$/i.test(f);
      });

      if (contentFiles.length > 0) {
        console.log(success(`Found ${contentFiles.length} content file(s) in root`));
        console.log(info('Using root directory as content'));
        console.log(dim('  To use subdirectory: create content/ or add contentDir to config.json'));

        return {
          contentRoot: workingDir,
          mode: 'structured',
          rootContent: true
        };
      }
    } catch (error) {
      // Continue to initialization
    }
  } else {
    const detectedDirs = skipDirs
      .filter(dir => fs.existsSync(path.join(workingDir, dir)))
      .slice(0, 3);

    console.log(warning(`Development folders detected: ${detectedDirs.join(', ')}`));
    console.log(info('Content must be in content/, or set contentDir in config.json'));
  }

  console.log(warning('No content directory found'));
  console.log(info('Will initialize content/ on first run'));

  return {
    contentRoot: contentDir,
    mode: 'structured',
    shouldInit: true
  };
}

/**
 * Build navigation tree from content
 */
export function buildNavigationTree(contentRoot, contentCache = new Map(), mode = 'structured') {
  const pathToEntry = new Map();
  for (const entry of contentCache.values()) {
    pathToEntry.set(entry.relativePath, entry);
  }

  const navigation = [];

  function processDirectory(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const webPath = normalizeToWebPath(relPath);

      if (entry.isDirectory() && entry.name === 'drafts') continue;

      if (entry.isDirectory()) {
        const children = processDirectory(fullPath, relPath);
        if (children.length > 0) {
          items.push({
            type: 'folder',
            name: entry.name,
            title: entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' '),
            children: children
          });
        }
      } else if (/\.(md|txt|html)$/i.test(entry.name)) {
        const url = generateUrl(webPath);

        const entryData = pathToEntry.get(webPath);
        const title = entryData ? entryData.title : null;

        const finalTitle = title || entry.name
          .replace(/\.(md|txt|html)$/, '')
          .replace(/^\d{4}-\d{2}-\d{2}-/, '')
          .replace(/-/g, ' ');

        items.push({
          type: 'file',
          name: entry.name,
          title: finalTitle,
          url: url,
          path: webPath
        });
      }
    }

    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  return processDirectory(contentRoot);
}

/**
 * Load all content from directory
 */
export function loadAllContent(options = {}) {
  const workingDir = process.cwd();
  const { contentRoot, mode, shouldInit } = detectContentStructure(workingDir, options);

  const contentCache = new Map();
  const slugMap = new Map();
  const imageReferences = new Map();
  const brokenImages = [];
  const imageDimensionsCache = new Map();

  console.log(dim(`Content mode: ${mode}`));
  console.log(dim(`Contents root: ${contentRoot}`));

  if (shouldInit) {
    console.log(info('No content found, will initialize on first run'));
    return { contentCache, slugMap, navigation: [], imageReferences, brokenImages, imageDimensionsCache, mode, contentRoot };
  }

  if (!fs.existsSync(contentRoot)) {
    console.log(warning(`Contents directory not found: ${contentRoot}`));
    return { contentCache, slugMap, navigation: [], imageReferences, brokenImages, imageDimensionsCache, mode, contentRoot };
  }

  const siteConfig = getSiteConfig();

  async function preScanImageDimensions(content, relativePath) {
    const imageMatches = content.matchAll(/!\[.*?\]\((.*?)\)/g);

    for (const match of imageMatches) {
      const src = match[1];

      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        continue;
      }

      let resolvedImagePath;
      if (src.startsWith('/')) {
        resolvedImagePath = path.join(contentRoot, src.substring(1));
      } else if (src.startsWith('./') || src.startsWith('../')) {
        const pageDir = path.dirname(path.join(contentRoot, relativePath));
        resolvedImagePath = path.resolve(pageDir, src);
      } else {
        const pageDir = path.dirname(path.join(contentRoot, relativePath));
        resolvedImagePath = path.resolve(pageDir, src);
      }

      if (fs.existsSync(resolvedImagePath) && !imageDimensionsCache.has(resolvedImagePath)) {
        try {
          const buffer = await fs.promises.readFile(resolvedImagePath);
          const meta = await sharp(buffer).metadata();
          imageDimensionsCache.set(resolvedImagePath, meta.width);
        } catch (error) {}
      }
    }
  }

  function loadContentFromDir(dir, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const webPath = normalizeToWebPath(relPath);

      if (entry.isDirectory() && entry.name === 'drafts') {
        console.log(dim(`Skipping drafts folder: ${webPath}`));
        continue;
      }

      if (isInDraftsFolder(relPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        loadContentFromDir(fullPath, relPath);
      } else if (/\.(md|txt|html)$/i.test(entry.name)) {
        if (entry.name.startsWith('_')) {
          console.log(warning(`${webPath} uses underscore prefix (intended for template partials, not content)`));
          console.log(dim(`  Consider using drafts/ folder or draft: true in front matter`));
        }

        try {
          const ext = path.extname(entry.name).toLowerCase();
          const isMarkdown = ext === '.md';

          let cachedContent = null;
          if (isMarkdown) {
            cachedContent = fs.readFileSync(fullPath, 'utf-8');
            const { content } = matter(cachedContent);
            preScanImageDimensions(content, webPath);
          }

          const result = processContentFile(fullPath, relPath, mode, contentRoot, siteConfig, cachedContent);

          if (!result) continue;

          if (slugMap.has(result.slug)) {
            const existingPath = slugMap.get(result.slug);
            console.error(errorMsg(`Duplicate URL detected: ${result.entry.url}`));
            console.log(dim(`  Used in: ${webPath}`));
            console.log(dim(`  Already used in: ${existingPath}`));
            process.exit(1);
          }

          contentCache.set(result.slug, result.entry);
          slugMap.set(webPath, result.slug);

          if (result.imageReferences.length > 0) {
            imageReferences.set(webPath, result.imageReferences);

            for (const img of result.imageReferences) {
              if (!fs.existsSync(img.resolvedPath)) {
                brokenImages.push({
                  post: webPath,
                  src: img.src,
                  resolvedPath: img.resolvedPath
                });

                if (siteConfig.strictImages === true) {
                  console.error(errorMsg(`Broken image in ${webPath}: ${img.src}`));
                  console.log(dim(`  Expected path: ${img.resolvedPath}`));
                  process.exit(1);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error loading content '${webPath}': ${error.message}`);
        }
      }
    }
  }

  try {
      loadContentFromDir(contentRoot);
      console.log(success(`Loaded ${contentCache.size} entry files`));
    } catch (error) {
      console.error(`Error reading content directory: ${error.message}`);
    }

    const navigation = buildNavigationTree(contentRoot, contentCache, mode);

    return { contentCache, slugMap, navigation, imageReferences, brokenImages, imageDimensionsCache, mode, contentRoot };
}
