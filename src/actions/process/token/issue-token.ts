import type { ActionContext, ActionHandler } from '../types.js';
import { ztsFromHash } from '../../../helpers/zts-from-hash.js';
import { updateAccountTokenBalance } from '../../indexer/update-account-token-balance.js';

export const issueToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const tokenStandard = ztsFromHash(sendBlock.hash);
  const totalSupply = BigInt(decoded.totalSupply.toString()).toString();
  const maxSupply = BigInt(decoded.maxSupply.toString()).toString();

  // The token registry may already hold a row loaded from RPC for this
  // standard. The issue call's values replace it.
  const [token] = await tx('nom_tokens')
    .insert({
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
    })
    .onConflict('token_standard')
    .merge()
    .returning('id');

  // The contract adds the new supply to its own balance, then sends it to
  // the issuer.
  await updateAccountTokenBalance(
    tx,
    sendBlock.toAccountId,
    token.id,
    BigInt(totalSupply),
    receiveBlock.createdAt,
  );
};
