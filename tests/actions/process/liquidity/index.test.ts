import { describe, it, expect } from 'vitest';

await import('../../../../src/actions/process/bridge/index.js');
await import('../../../../src/actions/process/liquidity/index.js');
const { getHandler } = await import('../../../../src/actions/process/registry.js');

describe('bridge and liquidity registrations', () => {
  it.each([
    ['Bridge Contract', 'Halt'],
    ['Bridge Contract', 'Unhalt'],
    ['Bridge Contract', 'Emergency'],
    ['Bridge Contract', 'ChangeTssECDSAPubKey'],
    ['Bridge Contract', 'SetAllowKeyGen'],
    ['Bridge Contract', 'SetBridgeMetadata'],
    ['Bridge Contract', 'SetOrchestratorInfo'],
    ['Liquidity Contract', 'SetTokenTuple'],
    ['Liquidity Contract', 'SetIsHalted'],
    ['Liquidity Contract', 'SetAdditionalReward'],
    ['Liquidity Contract', 'UnlockLiquidityStakeEntries'],
    ['Liquidity Contract', 'Emergency'],
  ])('registers %s.%s', (contract, method) => {
    expect(getHandler(contract, method)).toBeTypeOf('function');
  });

  it('gives each contract its own governance handlers', () => {
    for (const method of ['ChangeAdministrator', 'NominateGuardians', 'ProposeAdministrator']) {
      const bridge = getHandler('Bridge Contract', method);
      const liquidity = getHandler('Liquidity Contract', method);
      expect(bridge).toBeTypeOf('function');
      expect(liquidity).toBeTypeOf('function');
      expect(liquidity).not.toBe(bridge);
    }
  });
});
