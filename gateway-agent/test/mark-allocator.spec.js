'use strict';

const { stableId } = require('../src/mark-allocator');

describe('stableId', () => {
  it('is deterministic for the same key', () => {
    expect(stableId('dev-1:GAMING:dl')).toBe(stableId('dev-1:GAMING:dl'));
  });

  it('produces different ids for different keys (no accidental collisions in a small sample)', () => {
    const ids = new Set([
      stableId('dev-1:dl'),
      stableId('dev-1:ul'),
      stableId('dev-1:GAMING:dl'),
      stableId('dev-1:GAMING:ul'),
      stableId('dev-2:dl'),
    ]);
    expect(ids.size).toBe(5);
  });

  it('stays within the requested [min, max] range', () => {
    for (let i = 0; i < 50; i++) {
      const id = stableId(`key-${i}`, { min: 0x100, max: 0x7fff });
      expect(id).toBeGreaterThanOrEqual(0x100);
      expect(id).toBeLessThanOrEqual(0x7fff);
    }
  });

  it('respects a custom range', () => {
    const id = stableId('anything', { min: 5, max: 10 });
    expect(id).toBeGreaterThanOrEqual(5);
    expect(id).toBeLessThanOrEqual(10);
  });
});
