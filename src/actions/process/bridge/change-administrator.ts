import type { ActionHandler } from '../types.js';
import { BRIDGE_ADMINISTRATOR_DELAY } from '../../../constants/zenon.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { passTimeChallenge } from './time-challenge.js';
import { revokeAdministrator, type GovernedContract } from './governance.js';

/** ChangeAdministrator: replaces the administrator once its time challenge passes. */
export function makeChangeAdministrator(contract: GovernedContract): ActionHandler {
  return async (ctx) => {
    const { tx, decoded, receiveBlock } = ctx;

    const administrator = decoded.administrator as string;
    if (
      !(await passTimeChallenge(
        ctx,
        contract,
        'ChangeAdministrator',
        administrator,
        BRIDGE_ADMINISTRATOR_DELAY,
      ))
    ) {
      return;
    }

    await revokeAdministrator(tx, contract, receiveBlock.createdAt);
    await tx(contract.adminsTable).insert({
      account_id: await accountRegistry.getOrCreate(tx, administrator),
      accepted_at: receiveBlock.createdAt,
    });
  };
}
