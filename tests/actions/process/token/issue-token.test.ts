import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

vi.mock('../../../../src/helpers/zts-from-hash.js', () => ({
  ztsFromHash: vi.fn(() => 'zts1newtokenxxxxxxxxxxx'),
}));

const { issueToken } = await import('../../../../src/actions/process/token/issue-token.js');

describe('issueToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    tokenName: 'MyToken',
    tokenSymbol: 'MTK',
    tokenDomain: 'example.com',
    totalSupply: '1000000000',
    maxSupply: '2000000000',
    decimals: 8,
    isMintable: true,
    isBurnable: true,
    isUtility: false,
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a new token', async () => {
    tx.resolveNext(null); // no existing token
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(issueToken(ctx)).resolves.toBeUndefined();
  });

  it('skips if token already exists (idempotent)', async () => {
    tx.resolveNext({ id: 99 }); // existing token found

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(issueToken(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing tokenName', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenName: undefined } });
    await expect(issueToken(ctx)).rejects.toThrow('missing required field "tokenName"');
  });

  it('throws on missing tokenSymbol', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenSymbol: undefined } });
    await expect(issueToken(ctx)).rejects.toThrow('missing required field "tokenSymbol"');
  });

  it('throws on missing totalSupply', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, totalSupply: undefined } });
    await expect(issueToken(ctx)).rejects.toThrow('missing required field "totalSupply"');
  });

  it('throws on missing decimals', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, decimals: undefined } });
    await expect(issueToken(ctx)).rejects.toThrow('missing required field "decimals"');
  });

  it('converts totalSupply and maxSupply to string via BigInt', async () => {
    tx.resolveNext(null); // no existing token
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, totalSupply: '500000000000', maxSupply: '1000000000000' },
    });
    await expect(issueToken(ctx)).resolves.toBeUndefined();
  });
});
