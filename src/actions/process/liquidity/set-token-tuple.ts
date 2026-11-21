import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_SOFT_DELAY } from '../../../constants/zenon.js';
import { tokenRegistry } from '../../../services/registries/token-registry.js';
import { passTimeChallenge } from '../bridge/time-challenge.js';
import { LIQUIDITY_GOVERNANCE } from '../bridge/governance.js';

/**
 * SetTokenTuple: replaces the tokens accepted for liquidity staking and
 * their reward shares once the time challenge passes.
 */
export const setTokenTuple: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const tuples = (decoded.tokenStandards as string[]).map((tokenStandard, i) => ({
    tokenStandard: tokenStandard.toString(),
    znnPercentage: Number(decoded.znnPercentages[i]),
    qsrPercentage: Number(decoded.qsrPercentages[i]),
    minAmount: decoded.minAmounts[i].toString(),
  }));

  // The contract hashes the tuples in the order given.
  if (
    !(await passTimeChallenge(
      ctx,
      LIQUIDITY_GOVERNANCE,
      'SetTokenTuple',
      JSON.stringify(tuples),
      BRIDGE_SOFT_DELAY,
    ))
  ) {
    return;
  }

  const rows = [];
  for (const tuple of tuples) {
    const tokenId = await tokenRegistry.getOrLoad(tx, tuple.tokenStandard);
    if (tokenId === null) {
      throw new Error(`Liquidity.SetTokenTuple: token not found for ${tuple.tokenStandard}`);
    }
    rows.push({
      token_id: tokenId,
      znn_percentage: tuple.znnPercentage,
      qsr_percentage: tuple.qsrPercentage,
      min_amount: tuple.minAmount,
      created_at: receiveBlock.createdAt,
    });
  }

  await tx('nom_liquidity_token_tuples').del();
  if (rows.length > 0) {
    await tx('nom_liquidity_token_tuples').insert(rows);
  }
};
