import type { ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { revokeAdministrator, type GovernedContract } from './governance.js';

/**
 * ProposeAdministrator: a guardian's vote for a new administrator while an
 * emergency has left the contract without one.
 */
export function makeProposeAdministrator(contract: GovernedContract): ActionHandler {
  return async (ctx) => {
    const { tx, decoded, sendBlock, receiveBlock } = ctx;

    const proposedAccountId = await accountRegistry.getOrCreate(tx, decoded.address as string);

    // Each guardian holds one vote, so a new proposal replaces their last one.
    await tx(contract.adminsTable)
      .where({ nominated_by_id: sendBlock.accountId })
      .whereNull('accepted_at')
      .del();
    await tx(contract.adminsTable).insert({
      account_id: proposedAccountId,
      nominated_by_id: sendBlock.accountId,
      nominated_at: receiveBlock.createdAt,
    });

    // An address wins with more than half of the guardians' votes.
    const activeGuardians = await tx(contract.guardiansTable).whereNull('revoked_at').select('id');
    const threshold = Math.floor(activeGuardians.length / 2);

    const nominations = await tx(contract.adminsTable)
      .whereNull('accepted_at')
      .groupBy('account_id')
      .select('account_id')
      .count('* as count');

    const winner = nominations.find((n: any) => Number(n.count) > threshold);
    if (!winner) {
      return;
    }

    // The contract clears every vote once an administrator is elected.
    await tx(contract.adminsTable).whereNull('accepted_at').del();
    await revokeAdministrator(tx, contract, receiveBlock.createdAt);
    await tx(contract.adminsTable).insert({
      account_id: winner.account_id,
      accepted_at: receiveBlock.createdAt,
    });
  };
}
