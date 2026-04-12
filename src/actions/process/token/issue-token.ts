import type { ActionContext, ActionHandler } from '../types.js';
import { ztsFromHash } from '../../../helpers/zts-from-hash.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';

export const issueToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertRequiredFields(
    decoded,
    [
      'tokenName',
      'tokenSymbol',
      'tokenDomain',
      'totalSupply',
      'maxSupply',
      'decimals',
      'isMintable',
      'isBurnable',
      'isUtility',
    ],
    'Token.IssueToken',
  );

  const tokenStandard = ztsFromHash(sendBlock.hash);
  const totalSupply = BigInt(decoded.totalSupply.toString()).toString();
  const maxSupply = BigInt(decoded.maxSupply.toString()).toString();

  const existing = await tx('nom_tokens')
    .where({ token_standard: tokenStandard })
    .select('id')
    .first();
  if (existing) {
    return;
  }

  await tx('nom_tokens').insert({
    owner_id: sendBlock.accountId,
    name: decoded.tokenName,
    symbol: decoded.tokenSymbol,
    domain: decoded.tokenDomain,
    token_standard: tokenStandard,
    total_supply: totalSupply,
    initial_supply: totalSupply,
    max_supply: maxSupply,
    decimals: Number(decoded.decimals),
    is_mintable: Boolean(decoded.isMintable),
    is_burnable: Boolean(decoded.isBurnable),
    is_utility: Boolean(decoded.isUtility),
    created_at: receiveBlock.createdAt,
  });
};
