import { describe, test, expect } from 'bun:test';
import { extractTitleFromContent, extractDateFromFilename } from '../src/content-processor.js';
import { slugify } from '../src/utils/taxonomy.js';

describe('Content Processing', () => {
  test('extracts title from markdown H1', () => {
    const content = '# My Title\n\nContent here';
    const title = extractTitleFromContent(content, 'test.md');
    expect(title).toBe('My Title');
  });

  test('extracts date from filename', () => {
    const date = extractDateFromFilename('2024-01-15-hello.md');
    expect(date).toBe('2024-01-15');
  });

  test('slugifies text correctly', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Hello & Goodbye')).toBe('hello-goodbye');
  });
});