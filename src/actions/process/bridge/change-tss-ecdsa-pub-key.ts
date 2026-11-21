import { ECDH } from 'crypto';
import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_SOFT_DELAY } from '../../../constants/zenon.js';
import { activeAdministratorId, BRIDGE_GOVERNANCE } from './governance.js';
import { passTimeChallenge } from './time-challenge.js';
import { nextTssNonce, updateBridgeSettings } from './settings.js';

/**
 * The contract's decompressed key: 0x04 followed by the X and Y coordinates
 * as minimal big-endian integers, base64 encoded.
 */
export function decompressTssPubKey(compressedBase64: string): string {
  const point = ECDH.convertKey(
    Buffer.from(compressedBase64, 'base64'),
    'secp256k1',
    undefined,
    undefined,
    'uncompressed',
  ) as Buffer;
  const minimal = (b: Buffer) => {
    let start = 0;
    while (start < b.length && b[start] === 0) start++;
    return b.subarray(start);
  };
  return Buffer.concat([
    Buffer.from([4]),
    minimal(point.subarray(1, 33)),
    minimal(point.subarray(33, 65)),
  ]).toString('base64');
}

/**
 * ChangeTssECDSAPubKey: sets the bridge's TSS key and closes key generation.
 * The administrator's change waits for a time challenge. Anyone else changes
 * it at once with signatures from the old and new keys, which uses up the
 * current TSS nonce.
 */
export const changeTssEcdsaPubKey: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const compressed = decoded.pubKey as string;
  const decompressed = decompressTssPubKey(compressed);

  const fields: Record<string, unknown> = {
    compressed_tss_ecdsa_pub_key: compressed,
    decompressed_tss_ecdsa_pub_key: decompressed,
    allow_key_gen: false,
  };

  if (sendBlock.accountId === (await activeAdministratorId(tx, BRIDGE_GOVERNANCE))) {
    if (
      !(await passTimeChallenge(
        ctx,
        BRIDGE_GOVERNANCE,
        'ChangeTssECDSAPubKey',
        decompressed,
        BRIDGE_SOFT_DELAY,
      ))
    ) {
      return;
    }
  } else {
    fields.tss_nonce = nextTssNonce(tx);
  }

  await updateBridgeSettings(tx, 'ChangeTssECDSAPubKey', fields, receiveBlock.createdAt);
};
