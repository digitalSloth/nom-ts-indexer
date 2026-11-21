import { AccountBlock, BlockTypeEnum } from 'znn-typescript-sdk';

/** Status codes an embedded contract writes into its receive block's data. */
export const CALL_STATUS_SUCCESS = 1;
export const CALL_STATUS_FAILURE = 2;

/**
 * Read the execution status of an embedded contract call from its receive
 * block. A failed call is fully rolled back on chain, so only a successful
 * call changes contract state. Returns null for every other block type.
 */
export function contractCallStatus(block: AccountBlock): number | null {
  if (block.blockType !== BlockTypeEnum.ContractReceive) {
    return null;
  }

  const buf = blockDataBuffer(block.data);
  if (buf.length !== 8) {
    throw new Error(`Contract receive ${block.hash} has ${buf.length} data bytes, expected 8`);
  }

  const status = Number(buf.readBigUInt64BE(0));
  if (status !== CALL_STATUS_SUCCESS && status !== CALL_STATUS_FAILURE) {
    throw new Error(`Contract receive ${block.hash} has unknown call status ${status}`);
  }

  return status;
}

/** Block data as a Buffer. The node can return it as bytes or base64. */
export function blockDataBuffer(data: unknown): Buffer<ArrayBuffer> {
  if (data === null || data === undefined) {
    return Buffer.alloc(0);
  }
  return typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data as Uint8Array);
}
