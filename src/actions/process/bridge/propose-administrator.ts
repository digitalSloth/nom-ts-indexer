import type { ActionContext, ActionHandler } from '../types.js';

export const proposeAdministrator: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.address) {
    throw new Error('Bridge.ProposeAdministrator: missing required field "address"');
  }

  // Check sender is an active guardian
  const guardian = await tx('nom_bridge_guardians')
    .where({
      account_id: sendBlock.accountId,
    })
    .whereNull('revoked_at')
    .select('id')
    .first();
  if (!guardian) {
    console.warn('Bridge.ProposeAdministrator: sender is not an active guardian');
    return;
  }

  const proposedAccount = await tx('nom_accounts')
    .where({ address: decoded.address as string })
    .select('id')
    .first();
  if (!proposedAccount) {
    console.warn('Bridge.ProposeAdministrator: proposed account not found');
    return;
  }

  // Create nomination record
  await tx('nom_bridge_admins').insert({
    account_id: proposedAccount.id,
    nominated_by_id: sendBlock.accountId,
    nominated_at: receiveBlock.createdAt,
  });

  // Check if majority of guardians voted for the same address
  const activeGuardians = await tx('nom_bridge_guardians').whereNull('revoked_at').select('id');
  const numGuardians = activeGuardians.length;
  const votesNeeded = Math.floor(numGuardians / 2);

  const nominations = await tx('nom_bridge_admins')
    .whereNull('accepted_at')
    .groupBy('account_id')
    .select('account_id')
    .count('* as count');

  const winner = nominations.find((n: any) => Number(n.count) > votesNeeded);
  if (winner) {
    // Delete pending nominations
    await tx('nom_bridge_admins').whereNull('accepted_at').del();

    // Revoke current admin
    await tx('nom_bridge_admins')
      .whereNotNull('accepted_at')
      .whereNull('revoked_at')
      .update({ revoked_at: receiveBlock.createdAt });

    // Create new admin
    await tx('nom_bridge_admins').insert({
      account_id: winner.account_id,
      accepted_at: receiveBlock.createdAt,
    });
  }
};
