import { describe, it, expect } from 'vitest';
import { parseList } from '../../src/config/zenon.js';

describe('parseList', () => {
  it('splits a comma-separated list in order and trims each entry', () => {
    expect(parseList('wss://a:35998, wss://b:35998 ,ws://c')).toEqual([
      'wss://a:35998',
      'wss://b:35998',
      'ws://c',
    ]);
  });

  it('reads a single URL as a one-item list', () => {
    expect(parseList('ws://localhost:35998')).toEqual(['ws://localhost:35998']);
  });

  it('drops blank entries', () => {
    expect(parseList('ws://a,, ,ws://b,')).toEqual(['ws://a', 'ws://b']);
  });
});
