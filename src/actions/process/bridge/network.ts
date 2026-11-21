import { tokenRegistry } from '../../../services/registries/token-registry.js';
import { ZNN_TOKEN_STANDARD, QSR_TOKEN_STANDARD } from '../../../constants/zenon.js';

/**
 * Returns the id of the bridge network with this class and chain id. A
 * successful bridge call guarantees the network exists, so a missing row
 * means the indexer state has diverged from the chain.
 */
export async function requireBridgeNetwork(
  tx: any,
  methodName: string,
  networkClass: number | bigint,
  chainId: number | bigint,
): Promise<number> {
  const network = await tx('nom_bridge_networks')
    .where({
      network_class: BigInt(networkClass),
      chain_identifier: BigInt(chainId),
    })
    .whereNull('deleted_at')
    .select('id')
    .first();
  if (!network) {
    throw new Error(`Bridge.${methodName}: network not found for ${networkClass}/${chainId}`);
  }
  return network.id;
}

/**
 * Returns the id of a token the bridge refers to by standard, loading it
 * from the node when the indexer has not stored it yet.
 */
export async function requireBridgeToken(
  tx: any,
  methodName: string,
  tokenStandard: string,
): Promise<number> {
  const tokenId = await tokenRegistry.getOrLoad(tx, tokenStandard);
  if (tokenId === null) {
    throw new Error(`Bridge.${methodName}: token not found for ${tokenStandard}`);
  }
  return tokenId;
}

/**
 * Updates the wrapped, unwrapped and held totals of a network for a ZNN or
 * QSR transfer. A wrap counts when it is made and an unwrap when it is
 * redeemed, so `held` is what the bridge still holds for the network.
 * Other tokens have no totals.
 */
export async function updateNetworkTotals(
  tx: any,
  networkId: number,
  tokenId: number,
  direction: 'wrapped' | 'unwrapped',
  amount: string,
  at: Date,
): Promise<void> {
  const token = await tx('nom_tokens').where({ id: tokenId }).select('token_standard').first();
  const symbol =
    token?.token_standard === ZNN_TOKEN_STANDARD
      ? 'znn'
      : token?.token_standard === QSR_TOKEN_STANDARD
        ? 'qsr'
        : null;
  if (!symbol) return;

  // Totals are decimal strings and start as NULL on a new network.
  const add = (column: string, operator: '+' | '-') =>
    tx.raw(`(COALESCE(??, '0')::numeric ${operator} ?::numeric)::text`, [column, amount]);

  await tx('nom_bridge_networks')
    .where({ id: networkId })
    .update({
      [`total_${symbol}_${direction}`]: add(`total_${symbol}_${direction}`, '+'),
      [`total_${symbol}_held`]: add(`total_${symbol}_held`, direction === 'wrapped' ? '+' : '-'),
      updated_at: at,
    });
}
