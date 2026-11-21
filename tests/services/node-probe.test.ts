import { describe, it, expect } from 'vitest';
import { MAX_NODE_LAG, rankNodes } from '../../src/services/node-probe.js';

function node(frontierHeight: bigint, anchorHash: string | null = 'h50', chainId = 1) {
  return { chainId, frontierHeight, anchorHash };
}

const anchor = { height: 50n, hash: 'h50' };

describe('rankNodes', () => {
  it('lists usable nodes in priority order', () => {
    expect(rankNodes([node(100n), node(100n), node(101n)], anchor, 1)).toEqual({
      usable: [0, 1, 2],
      reasons: [null, null, null],
    });
  });

  it('rejects unreachable nodes, other chains, and nodes below the indexed height', () => {
    const { usable, reasons } = rankNodes(
      [new Error('connection failed'), node(100n, 'h50', 3), node(40n, null), node(100n)],
      anchor,
      1,
    );
    expect(usable).toEqual([3]);
    expect(reasons).toEqual([
      'connection failed',
      'chain id 3, expected 1',
      'frontier 40 is below indexed height 50',
      null,
    ]);
  });

  it('rejects a node with a different momentum at the indexed height', () => {
    const { usable, reasons } = rankNodes([node(100n, 'fork'), node(100n)], anchor, 1);
    expect(usable).toEqual([1]);
    expect(reasons[0]).toBe('momentum 50 has hash fork, indexed h50');
  });

  it('skips the hash check when the anchor hash is not stored', () => {
    const { usable } = rankNodes([node(100n, 'any')], { height: 50n, hash: null }, 1);
    expect(usable).toEqual([0]);
  });

  it('accepts any reachable node on the chain without an anchor', () => {
    const { usable } = rankNodes([node(5n, null)], null, 1);
    expect(usable).toEqual([0]);
  });

  it('rejects a node that trails the most advanced node by more than MAX_NODE_LAG', () => {
    const best = 100n;
    const { usable, reasons } = rankNodes(
      [node(best - MAX_NODE_LAG - 1n), node(best - MAX_NODE_LAG), node(best)],
      anchor,
      1,
    );
    expect(usable).toEqual([1, 2]);
    expect(reasons[0]).toBe(`frontier ${best - MAX_NODE_LAG - 1n} trails ${best}`);
  });

  it('does not let a rejected node set the lag baseline', () => {
    // The node on another chain is far ahead, but must not disqualify the others
    const { usable } = rankNodes([node(100n), node(999n, 'h50', 3)], anchor, 1);
    expect(usable).toEqual([0]);
  });
});
