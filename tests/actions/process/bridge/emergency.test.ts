import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from './helpers.js';

const { emergency } = await import('../../../../src/actions/process/bridge/emergency.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('bridge emergency', () => {
  it('revokes the administrator, clears the TSS key and halts', async () => {
    const tx = makeMockTx();

    await emergency(makeActionContext({ tx, receiveBlock: { createdAt: CREATED_AT } }));

    const [admins] = buildersFor(tx, 'nom_bridge_admins');
    expect(admins.whereNotNull).toHaveBeenCalledWith('accepted_at');
    expect(admins.whereNull).toHaveBeenCalledWith('revoked_at');
    expect(admins.update).toHaveBeenCalledWith({ revoked_at: CREATED_AT });
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      {
        compressed_tss_ecdsa_pub_key: null,
        decompressed_tss_ecdsa_pub_key: null,
        is_halted: true,
        halted_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    ]);
  });
});
