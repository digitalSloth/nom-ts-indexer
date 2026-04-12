import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_ADMINISTRATOR_DELAY } from '../../../constants/zenon.js';
import { assertBridgeAdmin } from './admin.js';
import { assertNoActiveChallenge } from './time-challenge.js';

export const changeAdministrator: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.administrator) {
    throw new Error('Bridge.ChangeAdministrator: missing required field "administrator"');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'ChangeAdministrator'))) return;

  if (
    !(await assertNoActiveChallenge(
      tx,
      receiveBlock,
      'ChangeAdministrator',
      decoded.administrator as string,
      BRIDGE_ADMINISTRATOR_DELAY,
    ))
  ) {
    console.warn('Bridge.ChangeAdministrator: time challenge still active');
    return;
  }

  const newAdminAccount = await tx('nom_accounts')
    .where({ address: decoded.administrator as string })
    .select('id')
    .first();
  if (!newAdminAccount) {
    console.warn('Bridge.ChangeAdministrator: admin account not found');
    return;
  }

  // Delete pending nominations
  await tx('nom_bridge_admins').whereNull('accepted_at').del();

  // Revoke current admin
  await tx('nom_bridge_admins')
    .whereNotNull('accepted_at')
    .whereNull('revoked_at')
    .update({ revoked_at: receiveBlock.createdAt });

  // Create new admin
  await tx('nom_bridge_admins').insert({
    account_id: newAdminAccount.id,
    accepted_at: receiveBlock.createdAt,
  });
};
