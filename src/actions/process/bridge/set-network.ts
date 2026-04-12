import type { ActionContext, ActionHandler } from '../types.js';
import { assertBridgeAdmin, findActiveBridgeNetwork } from './admin.js';

export const setNetwork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.networkClass || !decoded.chainId || !decoded.name || !decoded.contractAddress) {
    throw new Error('Bridge.SetNetwork: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'SetNetwork'))) return;

  if (decoded.name.length < 3 || decoded.name.length > 32) {
    console.warn('Bridge.SetNetwork: invalid name length');
    return;
  }

  if (decoded.networkClass < 1 || decoded.chainId < 1) {
    console.warn('Bridge.SetNetwork: invalid networkClass or chainId');
    return;
  }

  const networkClass = BigInt(decoded.networkClass);
  const chainIdentifier = BigInt(decoded.chainId);

  const existing = await tx('nom_bridge_networks')
    .where({ network_class: networkClass, chain_identifier: chainIdentifier })
    .select('id', 'deleted_at')
    .first();

  if (existing) {
    await tx('nom_bridge_networks')
      .where({ id: existing.id })
      .update({
        name: decoded.name as string,
        contract_address: decoded.contractAddress as string,
        meta_data: decoded.metadata ? JSON.stringify(decoded.metadata) : null,
        updated_at: receiveBlock.createdAt,
        deleted_at: null,
      });
  } else {
    await tx('nom_bridge_networks').insert({
      network_class: networkClass,
      chain_identifier: chainIdentifier,
      name: decoded.name as string,
      contract_address: decoded.contractAddress as string,
      meta_data: decoded.metadata ? JSON.stringify(decoded.metadata) : null,
      created_at: receiveBlock.createdAt,
    });
  }
};
