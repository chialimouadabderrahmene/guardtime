'use strict';

/**
 * Deterministic small-int allocator so tc classids stay stable across
 * cycles without needing persistent state — everything gets flushed and
 * rebuilt from scratch every sync anyway (Layer 7), so a pure function of
 * the key is simpler and equally correct.
 */
function stableId(key, { min = 1, max = 65535 } = {}) {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const range = max - min + 1;
  return min + (Math.abs(hash) % range);
}

module.exports = { stableId };
