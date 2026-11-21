import { describe, it, expect } from 'vitest';
import { swapKeyIdHash } from '../../../../src/actions/process/swap/key-id-hash.js';

// Mainnet swap contract block 3000 retrieved genesis entry 5217df3d...141b.
const UNCOMPRESSED =
  'BHi+EHYlLtDxjEXAWlu6pQTpat9iVYfR6H3O8/ECTypQNySnlPhbKetptlTX2bhzq4hOwYncv/E+QcibP4Kab0A=';
const KEY_ID_HASH = '5217df3d860b53564398b62f002ffc9df4e727c724bed43b1ce3e45bd615141b';

describe('swapKeyIdHash', () => {
  it('derives the genesis key id hash from an uncompressed public key', () => {
    expect(swapKeyIdHash(UNCOMPRESSED)).toBe(KEY_ID_HASH);
  });

  it('gives the same hash for the compressed form of the key', () => {
    const key = Buffer.from(UNCOMPRESSED, 'base64');
    const prefix = (key[64] & 1) === 1 ? 0x03 : 0x02;
    const compressed = Buffer.concat([Buffer.from([prefix]), key.subarray(1, 33)]);
    expect(swapKeyIdHash(compressed.toString('base64'))).toBe(KEY_ID_HASH);
  });
});
