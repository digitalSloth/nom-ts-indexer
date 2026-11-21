import { TokenStandard } from 'znn-typescript-sdk';
import { zenonClient } from '../zenon-client.js';
import { accountRegistry } from './account-registry.js';

/**
 * tokenStandard → tokenId. Token universe is small (a few thousand) so we keep
 * this unbounded. A miss falls through to the SDK's `embedded.token.getByZts`
 * RPC + Postgres upsert.
 */
class TokenRegistry {
  private map = new Map<string, number>();

  get(tokenStandard: string): number | undefined {
    return this.map.get(tokenStandard);
  }

  set(tokenStandard: string, id: number): void {
    this.map.set(tokenStandard, id);
  }

  clear(): void {
    this.map.clear();
  }

  async getOrLoad(txOrDb: any, tokenStandard: string | null | undefined): Promise<number | null> {
    if (!tokenStandard) return null;

    const cached = this.map.get(tokenStandard);
    if (cached !== undefined) return cached;

    const existing = await txOrDb('nom_tokens')
      .where({ token_standard: tokenStandard })
      .select('id')
      .first();
    if (existing) {
      this.map.set(tokenStandard, existing.id);
      return existing.id;
    }

    const data = await zenonClient
      .getSDK()
      .embedded.token.getByZts(TokenStandard.parse(tokenStandard));
    if (!data) return null;

    const ownerId = await accountRegistry.getOrCreate(txOrDb, data.owner.toString());

    // The node reports neither the initial supply nor the issue time, so
    // both stay null until the token's IssueToken is indexed.

    const token = await txOrDb('nom_tokens')
      .insert({
        owner_id: ownerId,
        name: data.name,
        symbol: data.symbol,
        domain: data.domain,
        token_standard: data.tokenStandard.toString(),
        total_supply: data.totalSupply.toString(),
        initial_supply: null,
        max_supply: data.maxSupply.toString(),
        decimals: data.decimals,
        is_burnable: data.isBurnable,
        is_mintable: data.isMintable,
        is_utility: data.isUtility,
      })
      .onConflict('token_standard')
      .merge()
      .returning('id');

    this.map.set(tokenStandard, token[0].id);
    return token[0].id;
  }
}

export const tokenRegistry = new TokenRegistry();
