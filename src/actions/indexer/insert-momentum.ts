import type { Momentum } from 'znn-typescript-sdk';
import { accountRegistry } from '../../services/registries/account-registry.js';
import { pillarRegistry } from '../../services/registries/pillar-registry.js';
import type { IndexedMomentumEvent } from '../../plugins/types.js';

/**
 * Insert a momentum (block) into the database.
 */
export async function insertMomentum(
  tx: any,
  momentumData: Momentum,
): Promise<IndexedMomentumEvent> {
  const hash = momentumData.hash.toString();

  const producerAccountId = await accountRegistry.getOrCreate(tx, momentumData.producer.toString());
  const pillarId = pillarRegistry.getPillarId(producerAccountId);

  const result = await tx('nom_momentums')
    .insert({
      producer_account_id: producerAccountId,
      producer_pillar_id: pillarId,
      version: momentumData.version,
      height: BigInt(momentumData.height),
      hash,
      data: momentumData.data ? Buffer.from(momentumData.data).toString('base64') : null,
      created_at: new Date(momentumData.timestamp * 1000),
    })
    .onConflict('hash')
    .merge()
    .returning('id');

  return {
    momentumId: result[0].id,
    height: BigInt(momentumData.height),
    hash,
    timestamp: momentumData.timestamp,
  };
}
