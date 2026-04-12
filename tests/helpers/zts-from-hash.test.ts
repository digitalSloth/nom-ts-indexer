import { describe, it, expect } from 'vitest';
import { ztsFromHash } from '../../src/helpers/zts-from-hash.js';

describe('ztsFromHash', () => {
  it('derives a token standard from a hex hash', () => {
    // Known hash: sha3-256 of 32 zero bytes, take first 10 bytes
    const hash = '0000000000000000000000000000000000000000000000000000000000000000';
    const result = ztsFromHash(hash);
    expect(result).toMatch(/^zts1/);
  });

  it('handles 0x-prefixed hash', () => {
    const hash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const result = ztsFromHash(hash);
    expect(result).toMatch(/^zts1/);
  });

  it('produces consistent output for same input', () => {
    const hash = 'aabbccdd'.repeat(8);
    const a = ztsFromHash(hash);
    const b = ztsFromHash(hash);
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const a = ztsFromHash('00'.repeat(32));
    const b = ztsFromHash('ff'.repeat(32));
    expect(a).not.toBe(b);
  });
});
