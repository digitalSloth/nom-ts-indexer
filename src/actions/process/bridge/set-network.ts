import type { ActionContext, ActionHandler } from '../types.js';

export const setNetwork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const networkClass = BigInt(decoded.networkClass);
  const chainIdentifier = BigInt(decoded.chainId);
  const fields = {
    name: decoded.name as string,
    contract_address: decoded.contractAddress as string,
    meta_data: decoded.metadata as string,
  };

  const existing = await tx('nom_bridge_networks')
    .where({ network_class: networkClass, chain_identifier: chainIdentifier })
    .select('id')
    .first();

  if (!existing) {
    await tx('nom_bridge_networks').insert({
      network_class: networkClass,
      chain_identifier: chainIdentifier,
      ...fields,
      created_at: receiveBlock.createdAt,
    });
    return;
  }

  await tx('nom_bridge_networks')
    .where({ id: existing.id })
    .update({ ...fields, updated_at: receiveBlock.createdAt, deleted_at: null });

  // Setting a network replaces it, token pairs included.
  await tx('nom_bridge_network_tokens').where({ bridge_network_id: existing.id }).del();
};
