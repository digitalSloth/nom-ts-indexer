import { Buffer } from 'buffer';
import { TokenStandard, Crypto } from 'znn-typescript-sdk';

/**
 * Derive a Zenon token standard from a send block hash.
 * Mirrors go-zenon `newTokenID(sendBlockHash) = sha3-256(hashBytes)[0:10]`
 */
export function ztsFromHash(sendBlockHashHex: string): string {
  const cleaned = sendBlockHashHex.startsWith('0x') ? sendBlockHashHex.slice(2) : sendBlockHashHex;
  const hash = Crypto.digest(Buffer.from(cleaned, 'hex'));
  return TokenStandard.fromCore(Buffer.from(hash.subarray(0, TokenStandard.coreSize))).toString();
}
