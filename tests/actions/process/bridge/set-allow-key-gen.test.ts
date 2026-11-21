import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { setAllowKeyGen } =
  await import('../../../../src/actions/process/bridge/set-allow-key-gen.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setAllowKeyGen', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = (allowKeyGen: boolean) =>
    setAllowKeyGen(
      makeActionContext({
        tx,
        decoded: { allowKeyGen },
        receiveBlock: { createdAt: CREATED_AT },
        frontierMomentum: { height: 4452834n },
      }),
    );

  it('opens key generation at the frontier height', async () => {
    await run(true);
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      { allow_key_gen: true, allow_key_gen_height: 4452834n, updated_at: CREATED_AT },
    ]);
  });

  it('closes key generation and keeps the height it last opened at', async () => {
    await run(false);
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      { allow_key_gen: false, updated_at: CREATED_AT },
    ]);
  });
});
