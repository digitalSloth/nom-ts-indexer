import { describe, expect, it } from 'vitest';
import {
  CALL_STATUS_FAILURE,
  CALL_STATUS_SUCCESS,
  contractCallStatus,
} from '../../../src/actions/indexer/contract-call-status.js';
import { makeMockAccountBlock } from '../../helpers/mock-zenon.js';

const CONTRACT_RECEIVE = 5;

function receive(dataHex: string) {
  return makeMockAccountBlock({ blockType: CONTRACT_RECEIVE, data: Buffer.from(dataHex, 'hex') });
}

describe('contractCallStatus', () => {
  it('reads success from a contract receive block', () => {
    expect(contractCallStatus(receive('0000000000000001'))).toBe(CALL_STATUS_SUCCESS);
  });

  it('reads failure from a contract receive block', () => {
    expect(contractCallStatus(receive('0000000000000002'))).toBe(CALL_STATUS_FAILURE);
  });

  it('reads base64 data', () => {
    const block = makeMockAccountBlock({ blockType: CONTRACT_RECEIVE, data: 'AAAAAAAAAAI=' });
    expect(contractCallStatus(block)).toBe(CALL_STATUS_FAILURE);
  });

  it('returns null for other block types', () => {
    const send = makeMockAccountBlock({
      blockType: 2,
      data: Buffer.from('0000000000000001', 'hex'),
    });
    expect(contractCallStatus(send)).toBeNull();
  });

  it('throws when the data is not 8 bytes', () => {
    expect(() => contractCallStatus(receive('01'))).toThrow(/1 data bytes, expected 8/);
  });

  it('throws on an unknown status code', () => {
    expect(() => contractCallStatus(receive('0000000000000000'))).toThrow(/unknown call status 0/);
  });
});
