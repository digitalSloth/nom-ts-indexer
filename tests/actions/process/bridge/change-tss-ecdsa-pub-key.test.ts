import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_SOFT_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor } from './helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const { changeTssEcdsaPubKey, decompressTssPubKey } =
  await import('../../../../src/actions/process/bridge/change-tss-ecdsa-pub-key.js');
const { BRIDGE_GOVERNANCE } = await import('../../../../src/actions/process/bridge/governance.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');
// The mainnet bridge key and its decompressed form from embedded.bridge.getBridgeInfo
const COMPRESSED = 'Ah+UOuLxcWVIoON3ww7f5yRwjUsUdjy9xTrM6TeqVyGn';
const DECOMPRESSED =
  'BB+UOuLxcWVIoON3ww7f5yRwjUsUdjy9xTrM6TeqVyGnBtCLRba7zruoOzGhqqnQGaGajwAvQO3Czm6tcZlNW84=';

describe('decompressTssPubKey', () => {
  it('matches the key the contract stores', () => {
    expect(decompressTssPubKey(COMPRESSED)).toBe(DECOMPRESSED);
  });
});

describe('changeTssEcdsaPubKey', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
  });

  const run = (senderId: number) =>
    changeTssEcdsaPubKey(
      makeActionContext({
        tx,
        decoded: { pubKey: COMPRESSED, oldPubKeySignature: '', newPubKeySignature: '' },
        sendBlock: { accountId: senderId },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  const keyFields = {
    compressed_tss_ecdsa_pub_key: COMPRESSED,
    decompressed_tss_ecdsa_pub_key: DECOMPRESSED,
    allow_key_gen: false,
  };

  it("only starts the time challenge on the administrator's first call", async () => {
    tx.resolveNext({ account_id: 3 }); // active administrator
    passTimeChallenge.mockResolvedValue(false);

    await run(3);

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      BRIDGE_GOVERNANCE,
      'ChangeTssECDSAPubKey',
      DECOMPRESSED,
      BRIDGE_SOFT_DELAY,
    );
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([]);
  });

  it('sets the key once the administrator passes the time challenge', async () => {
    tx.resolveNext({ account_id: 3 });
    passTimeChallenge.mockResolvedValue(true);

    await run(3);

    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      { ...keyFields, updated_at: CREATED_AT },
    ]);
    expect(tx.raw).not.toHaveBeenCalled();
  });

  it('sets the key at once and uses up a TSS nonce for a signed change', async () => {
    tx.resolveNext({ account_id: 3 });

    await run(9);

    expect(passTimeChallenge).not.toHaveBeenCalled();
    const [fields] = argsFor(tx, 'nom_bridge_settings', 'update');
    expect(fields).toMatchObject(keyFields);
    expect(tx.raw).toHaveBeenCalledWith('?? + 1', ['tss_nonce']);
  });
});
