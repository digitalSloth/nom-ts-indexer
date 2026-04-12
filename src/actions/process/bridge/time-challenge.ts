import { createHash } from 'crypto';

interface TimeChallengeResult {
  isActive: boolean;
}

/**
 * Checks or creates a time challenge for a contract method.
 * Returns { isActive: true } if the challenge is still active (action should be skipped).
 * Returns { isActive: false } if the challenge has expired or is new (action should proceed).
 */
export async function checkTimeChallenge(
  tx: any,
  contractMethodName: string,
  challengeData: string,
  delay: number,
  momentumHeight: bigint,
  momentumCreatedAt: Date,
): Promise<TimeChallengeResult> {
  const contractMethod = await tx('nom_contract_methods')
    .where({ name: contractMethodName })
    .select('id')
    .first();
  if (!contractMethod) {
    return { isActive: false };
  }

  const hash = createHash('sha256').update(challengeData).digest('hex');

  const challenge = await tx('nom_time_challenges')
    .where({
      contract_method_id: contractMethod.id,
      is_active: true,
    })
    .select('id', 'hash', 'start_height', 'end_height')
    .first();

  if (!challenge) {
    // Create new challenge
    await tx('nom_time_challenges').insert({
      contract_method_id: contractMethod.id,
      hash,
      delay: BigInt(delay),
      start_height: momentumHeight,
      end_height: momentumHeight + BigInt(delay),
      is_active: true,
      created_at: momentumCreatedAt,
    });
    return { isActive: true };
  }

  if (challenge.hash && challenge.hash === hash) {
    // Hash matches - check if challenge has expired
    if (challenge.end_height && momentumHeight >= challenge.end_height) {
      // Challenge expired, deactivate
      await tx('nom_time_challenges').where({ id: challenge.id }).update({ is_active: false });
      return { isActive: false };
    }
    // Challenge still active
    return { isActive: true };
  }

  // Hash doesn't match - reset challenge
  await tx('nom_time_challenges')
    .where({ id: challenge.id })
    .update({
      hash,
      start_height: momentumHeight,
      end_height: momentumHeight + BigInt(delay),
    });
  return { isActive: true };
}

/**
 * Checks if a time challenge is active for the given action.
 * Returns true if no challenge is active (safe to proceed), false if a challenge is active (warns and returns).
 */
export async function assertNoActiveChallenge(
  tx: any,
  receiveBlock: { momentumId: number },
  actionName: string,
  challengeData: string,
  delay: number,
): Promise<boolean> {
  const momentum = await tx('nom_momentums')
    .where({ id: receiveBlock.momentumId })
    .select('height', 'created_at')
    .first();
  if (!momentum) return true;

  const challenge = await checkTimeChallenge(
    tx,
    actionName,
    challengeData,
    delay,
    momentum.height,
    momentum.created_at,
  );
  if (challenge.isActive) {
    console.warn(`Bridge.${actionName}: time challenge still active`);
    return false;
  }
  return true;
}
