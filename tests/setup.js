// Global test setup
import { beforeAll } from 'bun:test';

beforeAll(() => {
  // Silence console.log during tests
  global.console = {
    ...console,
    log: () => {},
    info: () => {},
    warn: () => {},
    // Keep error for debugging
    error: console.error
  };
});