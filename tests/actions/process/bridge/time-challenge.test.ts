import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from './helpers.js';

const { passTimeChallenge } =
  await import('../../../../src/actions/process/bridge/time-challenge.js');
const { BRIDGE_GOVERNANCE, LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('passTimeChallenge', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = (height = 500n, contract = BRIDGE_GOVERNANCE) =>
    passTimeChallenge(
      makeActionContext({
        tx,
        receiveBlock: { id: 5, createdAt: CREATED_AT },
        frontierMomentum: { height },
      }),
      contract,
      'SetTokenPair',
      'params',
      100,
    );

  it('starts a challenge at the frontier momentum height and does not apply', async () => {
    tx.resolveNext({ id: 3 }); // bridge contract method
    tx.resolveNext(null); // no active challenge

    await expect(run()).resolves.toBe(false);

    expect(argsFor(tx, 'nom_time_challenges', 'insert')).toEqual([
      {
        contract_method_id: 3,
        hash: sha256('params'),
        delay: 100n,
        start_height: 500n,
        end_height: 600n,
        expires_at: expect.anything(),
        created_at: CREATED_AT,
        is_active: true,
      },
    ]);
    const [expiry] = buildersFor(tx, 'nom_momentums');
    expect(expiry.where).toHaveBeenCalledWith({ height: 601n });
  });

  it('applies and clears the challenge when the params match', async () => {
    tx.resolveNext({ id: 3 });
    tx.resolveNext({ id: 9, hash: sha256('params') });

    await expect(run()).resolves.toBe(true);

    expect(argsFor(tx, 'nom_time_challenges', 'update')).toEqual([{ is_active: false }]);
  });

  it('restarts the challenge when the params differ', async () => {
    tx.resolveNext({ id: 3 });
    tx.resolveNext({ id: 9, hash: sha256('other') });

    await expect(run(700n)).resolves.toBe(false);

    expect(argsFor(tx, 'nom_time_challenges', 'update')).toEqual([
      {
        hash: sha256('params'),
        delay: 100n,
        start_height: 700n,
        end_height: 800n,
        expires_at: expect.anything(),
        created_at: CREATED_AT,
      },
    ]);
  });

  it('throws when the bridge contract method is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.SetTokenPair: contract method not found');
  });

  it('looks up the method on the given contract, since both contracts share method names', async () => {
    tx.resolveNext({ id: 4 });
    tx.resolveNext(null);

    await run(500n, LIQUIDITY_GOVERNANCE);

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({
      'c.name': 'Liquidity Contract',
      'cm.name': 'SetTokenPair',
    });
  });
});
