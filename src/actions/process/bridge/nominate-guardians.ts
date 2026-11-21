import type { ActionHandler } from '../types.js';
import { BRIDGE_ADMINISTRATOR_DELAY } from '../../../constants/zenon.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { passTimeChallenge } from './time-challenge.js';
import type { GovernedContract } from './governance.js';

/** NominateGuardians: replaces the guardian set once its time challenge passes. */
export function makeNominateGuardians(contract: GovernedContract): ActionHandler {
  return async (ctx) => {
    const { tx, decoded, receiveBlock } = ctx;

    const guardians = decoded.guardians as string[];
    // The contract hashes the guardians sorted by address.
    const challengeData = [...guardians].sort().join(',');
    if (
      !(await passTimeChallenge(
        ctx,
        contract,
        'NominateGuardians',
        challengeData,
        BRIDGE_ADMINISTRATOR_DELAY,
      ))
    ) {
      return;
    }

    await tx(contract.guardiansTable)
      .whereNull('revoked_at')
      .update({ revoked_at: receiveBlock.createdAt });

    for (const address of guardians) {
      await tx(contract.guardiansTable).insert({
        account_id: await accountRegistry.getOrCreate(tx, address),
        nominated_at: receiveBlock.createdAt,
        accepted_at: receiveBlock.createdAt,
      });
    }

    // A new guardian set starts with no administrator votes.
    await tx(contract.adminsTable).whereNull('accepted_at').del();
  };
}
