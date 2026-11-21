import { createHash } from 'crypto';

/**
 * The legacy swap key id hash of a public key, as the swap contract derives
 * it: sha256(ripemd160(sha256(compressed key))). The key is base64, either an
 * uncompressed 65-byte secp256k1 key or an already compressed 33-byte key.
 */
export function swapKeyIdHash(publicKeyBase64: string): string {
  const key = Buffer.from(publicKeyBase64, 'base64');
  const compressed = key.length === 65 ? compressPublicKey(key) : key;
  const keyId = createHash('ripemd160')
    .update(createHash('sha256').update(compressed).digest())
    .digest();
  return createHash('sha256').update(keyId).digest('hex');
}

function compressPublicKey(uncompressed: Buffer): Buffer {
  const x = uncompressed.subarray(1, 33);
  const yIsOdd = (uncompressed[64] & 1) === 1;
  return Buffer.concat([Buffer.from([yIsOdd ? 0x03 : 0x02]), x]);
}
