import { describe, it, expect } from 'vitest';

describe('Project Setup', () => {
  it('should have vitest working', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have fast-check available', async () => {
    const fc = await import('fast-check');
    expect(fc.default).toBeDefined();
  });

  it('should have jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});
