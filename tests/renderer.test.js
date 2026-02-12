import { describe, test, expect } from 'bun:test';
import { renderEntry, renderEntryList, renderTagPage, getPaginationData } from '../src/renderer.js';

describe('Content Rendering', () => {
  const mockEntry = {
    slug: 'test',
    title: 'Test',
    html: '<p>Content</p>',
    tags: ['test'],
    categories: [],
    date: '2024-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    url: '/test/',
    description: 'Test page'
  };

  const mockTemplates = new Map([
    ['entry', (ctx) => `<html><h1>${ctx.entry.title}</h1>${ctx.entry.html}</html>`],
    ['index', (ctx) => `<html>${ctx.entries.map(e => e.title).join(',')}</html>`]
  ]);

  test('renders entry with correct context', () => {
    const html = renderEntry(mockEntry, 'test', mockTemplates, [], {}, null, {});
    expect(html).toContain('Test');
    expect(html).toContain('<p>Content</p>');
  });

  test('renders entry list with pagination', () => {
    const cache = new Map([['test', mockEntry]]);
    const html = renderEntryList(cache, 1, mockTemplates, [], {}, {});
    expect(html).toContain('Test');
  });

  test('renders tag page with filtered entries', () => {
    const cache = new Map([['test', mockEntry]]);
    const html = renderTagPage(cache, 'test', mockTemplates, [], {}, {});
    expect(html).toContain('Test');
  });

  test('calculates pagination correctly', () => {
    const cache = new Map();
    for (let i = 0; i < 25; i++) {
      cache.set(`entry-${i}`, { ...mockEntry, slug: `entry-${i}` });
    }
    
    const pagination = getPaginationData(cache, 2);
    expect(pagination.totalPages).toBe(3);
    expect(pagination.currentPage).toBe(2);
    expect(pagination.hasPrev).toBe(true);
    expect(pagination.hasNext).toBe(true);
  });

  test('includes prev/next navigation', () => {
    const cache = new Map([
      ['prev', { ...mockEntry, slug: 'prev', title: 'Prev', createdAt: '2024-01-02' }],
      ['test', { ...mockEntry, createdAt: '2024-01-01' }],
      ['next', { ...mockEntry, slug: 'next', title: 'Next', createdAt: '2023-12-31' }]
    ]);
    const templates = new Map([
      ['entry', (ctx) => JSON.stringify(ctx)]
    ]);
    const html = renderEntry(mockEntry, 'test', templates, [], {}, cache, {});
    expect(html).toContain('Prev');
    expect(html).toContain('Next');
  });
});