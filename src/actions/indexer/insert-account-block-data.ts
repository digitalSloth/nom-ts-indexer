import type { AccountBlock } from 'znn-typescript-sdk';
import { getEmbeddedContractByName } from '../../constants/zenon.js';
import { contractRegistry } from '../../services/registries/contract-registry.js';

export interface InsertedBlockData {
  rawData: Buffer<ArrayBuffer>;
  decodedArgs: Record<string, unknown> | null;
  contractMethodId: number | null;
}

/**
 * Decode and store the raw data payload for an account block.
 * Attempts ABI decoding if the first 4 bytes match a known contract method.
 */
export async function insertAccountBlockData(
  tx: any,
  accountBlockId: number,
  toAccountId: number,
  accountBlockData: AccountBlock,
): Promise<InsertedBlockData> {
  const rawInput = accountBlockData.data!;
  const buf: Buffer<ArrayBuffer> =
    typeof rawInput === 'string' ? Buffer.from(rawInput, 'base64') : Buffer.from(rawInput as any);
  const rawBase64 = buf.toString('base64');

  let decodedArgs: Record<string, unknown> | null = null;
  let contractMethodId: number | null = null;

  if (buf.length >= 4) {
    const fingerprint = buf.subarray(0, 4).toString('hex');
    const contractName = contractRegistry.getContractName(toAccountId);
    const methodId = contractRegistry.getMethodId(contractName, fingerprint);

    if (methodId !== null) {
      contractMethodId = methodId;

      const entry = getEmbeddedContractByName(contractName);
      if (entry) {
        try {
          const decoded = entry.contractClass.decodeCallData('0x' + buf.toString('hex'));
          const args = decoded.args;
          decodedArgs =
            args && typeof args === 'object' && !Array.isArray(args)
              ? (args as Record<string, unknown>)
              : null;
        } catch {
          decodedArgs = null;
        }
      }
    }
  }

  // Fallback: try raw JSON decode for non-contract data
  if (decodedArgs === null && buf.length > 0) {
    try {
      const parsed = JSON.parse(buf.toString('utf-8'));
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        decodedArgs = parsed;
      }
    } catch {
      // not valid JSON — leave decodedArgs as null
    }
  }

  if (contractMethodId !== null) {
    await tx('nom_account_blocks')
      .where({ id: accountBlockId })
      .update({ contract_method_id: contractMethodId });
  }

  await tx('nom_account_block_data')
    .insert({
      account_block_id: accountBlockId,
      raw: rawBase64,
      decoded: decodedArgs ? JSON.stringify(decodedArgs) : null
    })
    .onConflict('account_block_id')
    .merge();

  return { rawData: buf, decodedArgs, contractMethodId };
}
