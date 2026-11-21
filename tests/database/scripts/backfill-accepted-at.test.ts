import { describe, it, expect } from 'vitest';
import { AcceleratorProjectVote } from 'znn-typescript-sdk';
import type {
  AcceleratorCall,
  PillarTerm,
} from '../../../src/database/scripts/backfill-accepted-at.js';

const { replayAcceptance } = await import('../../../src/database/scripts/backfill-accepted-at.js');

const G = Date.parse('2024-01-01T00:00:00Z');
const DAY = 86_400_000;
const at = (days: number, seconds = 0) => new Date(G + days * DAY + seconds * 1000);

const { yes, no, abstain } = AcceleratorProjectVote;
const PROJECT = { id: 1, hash: 'aa', createdAt: at(0) };

/** Ten pillars registered before the project: a pass needs 4 votes (4 * 100 > 10 * 33). */
const TEN: PillarTerm[] = Array.from({ length: 10 }, () => ({
  createdAt: at(-30),
  revokedAt: null,
}));

const vote = (pillar: number, value: number, itemHash = 'aa'): AcceleratorCall => ({
  kind: 'vote',
  itemHash,
  pillarName: `pillar-${pillar}`,
  vote: value,
});
const update = (frontier: Date): AcceleratorCall => ({ kind: 'update', frontier });

describe('replayAcceptance', () => {
  it('accepts at the first update after the votes reach quorum', () => {
    const accepted = replayAcceptance(
      [PROJECT],
      [
        vote(1, yes),
        vote(2, yes),
        vote(3, yes),
        update(at(1)),
        vote(4, yes),
        update(at(2)),
        update(at(3)),
      ],
      TEN,
    );

    expect(accepted).toEqual(new Map([[1, at(2)]]));
  });

  it('counts abstain votes toward quorum but needs more yes than no', () => {
    const tied = replayAcceptance(
      [PROJECT],
      [vote(1, yes), vote(2, yes), vote(3, no), vote(4, no), vote(5, abstain), update(at(1))],
      TEN,
    );
    const ahead = replayAcceptance(
      [PROJECT],
      [vote(1, yes), vote(2, yes), vote(3, no), vote(4, abstain), update(at(1))],
      TEN,
    );

    expect(tied.size).toBe(0);
    expect(ahead).toEqual(new Map([[1, at(1)]]));
  });

  it('keeps one vote per pillar, the latest', () => {
    const accepted = replayAcceptance(
      [PROJECT],
      [
        vote(1, yes),
        vote(1, yes),
        vote(1, yes),
        vote(2, no),
        vote(3, yes),
        update(at(1)),
        vote(4, no),
        vote(2, yes),
        update(at(2)),
      ],
      TEN,
    );

    expect(accepted).toEqual(new Map([[1, at(2)]]));
  });

  it('accepts on the last second of the voting period and never after it', () => {
    const passing = [vote(1, yes), vote(2, yes), vote(3, yes), vote(4, yes)];

    expect(replayAcceptance([PROJECT], [...passing, update(at(14))], TEN)).toEqual(
      new Map([[1, at(14)]]),
    );
    expect(
      replayAcceptance([PROJECT], [...passing, update(at(14, 1)), update(at(15))], TEN).size,
    ).toBe(0);
  });

  it('counts only the pillars active at the update frontier', () => {
    const passing = [vote(1, yes), vote(2, yes), vote(3, yes), vote(4, yes)];
    // Three more pillars make 13, which needs 5 votes, until two are revoked.
    const pillars: PillarTerm[] = [
      ...TEN,
      { createdAt: at(1), revokedAt: null },
      { createdAt: at(1), revokedAt: at(3) },
      { createdAt: at(1), revokedAt: at(3) },
    ];

    const accepted = replayAcceptance(
      [PROJECT],
      [...passing, update(at(2)), update(at(3))],
      pillars,
    );

    expect(accepted).toEqual(new Map([[1, at(3)]]));
    expect(replayAcceptance([PROJECT], [...passing, update(at(1))], pillars).size).toBe(0);
    expect(replayAcceptance([PROJECT], [...passing, update(at(1, -1))], pillars)).toEqual(
      new Map([[1, at(1, -1)]]),
    );
  });

  it('ignores votes for other items', () => {
    const accepted = replayAcceptance(
      [PROJECT],
      [vote(1, yes), vote(2, yes), vote(3, yes), vote(4, yes, 'bb'), update(at(1))],
      TEN,
    );

    expect(accepted.size).toBe(0);
  });
});
