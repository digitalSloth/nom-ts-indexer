import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_SOFT_DELAY } from '../../../constants/zenon.js';
import { assertBridgeAdmin } from './admin.js';
import { assertNoActiveChallenge } from './time-challenge.js';

export const nominateGuardians: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.guardians || !Array.isArray(decoded.guardians) || decoded.guardians.length < 1) {
    throw new Error('Bridge.NominateGuardians: missing or empty guardians array');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'NominateGuardians'))) return;

  // Sort guardians to ensure deterministic hash
  const sortedGuardians = [...(decoded.guardians as string[])].sort().join(',');
  if (
    !(await assertNoActiveChallenge(
      tx,
      receiveBlock,
      'NominateGuardians',
      sortedGuardians,
      BRIDGE_SOFT_DELAY,
    ))
  ) {
    console.warn('Bridge.NominateGuardians: time challenge still active');
    return;
  }

  // Revoke all existing guardians
  await tx('nom_bridge_guardians')
    .whereNull('revoked_at')
    .update({ revoked_at: receiveBlock.createdAt });

  // Create new guardians
  for (const guardianAddress of decoded.guardians as string[]) {
    const account = await tx('nom_accounts')
      .where({ address: guardianAddress })
      .select('id')
      .first();
    if (!account) {
      console.warn(`Bridge.NominateGuardians: account not found for ${guardianAddress}`);
      continue;
    }

    await tx('nom_bridge_guardians').insert({
      account_id: account.id,
      nominated_at: receiveBlock.createdAt,
      accepted_at: receiveBlock.createdAt,
    });
  }
};
