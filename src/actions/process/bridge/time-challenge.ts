import { createHash } from 'crypto';
import type { ActionContext } from '../types.js';
import type { GovernedContract } from './governance.js';

/**
 * The time of the first momentum after `endHeight`, from which the change
 * can apply. It is null until that momentum is indexed, and
 * `settleTimeChallenges` fills it then.
 */
function challengeExpiry(tx: any, endHeight: bigint) {
  return tx('nom_momentums')
    .where({ height: endHeight + 1n })
    .select('created_at');
}

/**
 * Models a contract's time challenge for an admin call that succeeded on
 * chain, and returns true when the caller should apply the change.
 *
 * A call whose params match the pending challenge applies the change and
 * clears the challenge. Any other call starts a new challenge at the
 * frontier momentum height and changes nothing else. A matching call made
 * before the delay has passed fails on chain, so it never reaches a handler.
 * Each contract keeps one challenge per method.
 */
export async function passTimeChallenge(
  ctx: ActionContext,
  contract: GovernedContract,
  methodName: string,
  challengeData: string,
  delay: number,
): Promise<boolean> {
  const { tx, receiveBlock, frontierMomentum } = ctx;

  const method = await tx('nom_contract_methods as cm')
    .join('nom_contracts as c', 'cm.contract_id', 'c.id')
    .where({ 'c.name': contract.contractName, 'cm.name': methodName })
    .select('cm.id')
    .first();
  if (!method) {
    throw new Error(`${contract.label}.${methodName}: contract method not found`);
  }

  const hash = createHash('sha256').update(challengeData).digest('hex');
  const challenge = await tx('nom_time_challenges')
    .where({ contract_method_id: method.id, is_active: true })
    .select('id', 'hash')
    .first();

  if (challenge && challenge.hash === hash) {
    await tx('nom_time_challenges').where({ id: challenge.id }).update({ is_active: false });
    return true;
  }

  const startHeight = frontierMomentum.height;
  const fields = {
    hash,
    delay: BigInt(delay),
    start_height: startHeight,
    // The change can apply in any momentum after this height.
    end_height: startHeight + BigInt(delay),
  };

  // A restart is a new challenge, so it takes this call's time.
  const started = {
    ...fields,
    expires_at: challengeExpiry(tx, fields.end_height),
    created_at: receiveBlock.createdAt,
  };
  if (challenge) {
    await tx('nom_time_challenges').where({ id: challenge.id }).update(started);
  } else {
    await tx('nom_time_challenges').insert({
      contract_method_id: method.id,
      ...started,
      is_active: true,
    });
  }
  return false;
}
