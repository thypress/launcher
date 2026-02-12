import { describe, test, expect } from 'bun:test';
import { parseRedirectRules } from '../src/build.js';

describe('Redirect System', () => {
  test('parses simple redirect rules', () => {
    const data = { '/old/': '/new/' };
    const { rules, errors } = parseRedirectRules(data);
    
    expect(errors.length).toBe(0);
    expect(rules.length).toBe(1);
    expect(rules[0].statusCode).toBe(301);
  });

  test('parses advanced redirect rules', () => {
    const data = {
      '/temp/': { to: '/new/', statusCode: 302 }
    };
    const { rules, errors } = parseRedirectRules(data);
    
    expect(rules[0].statusCode).toBe(302);
  });

  test('rejects invalid status codes', () => {
    const data = {
      '/test/': { to: '/new/', statusCode: 200 }
    };
    const { rules, errors } = parseRedirectRules(data);
    
    expect(errors.length).toBeGreaterThan(0);
  });

  test('handles pattern redirects', () => {
    const data = { '/blog/:slug/': '/pages/:slug/' };
    const { rules, errors } = parseRedirectRules(data);
    
    expect(errors.length).toBe(0);
    expect(rules[0].from).toContain(':slug');
  });
});