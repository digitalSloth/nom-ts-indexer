import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { setBridgeMetadata } =
  await import('../../../../src/actions/process/bridge/set-bridge-metadata.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setBridgeMetadata', () => {
  it('stores the metadata string as given', async () => {
    const tx = makeMockTx();
    await setBridgeMetadata(
      makeActionContext({
        tx,
        decoded: { metadata: '{"partyTimeout":90}' },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      { metadata: '{"partyTimeout":90}', updated_at: CREATED_AT },
    ]);
  });
});
