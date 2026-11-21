import { describe, it, expect, vi } from 'vitest';

const { updateLiquiditySettings } =
  await import('../../../../src/actions/process/liquidity/settings.js');

describe('updateLiquiditySettings', () => {
  it('throws when the seeded settings row is missing', async () => {
    const update = vi.fn(async () => 0);
    const tx: any = vi.fn(() => ({ where: () => ({ update }) }));

    await expect(
      updateLiquiditySettings(tx, 'SetIsHalted', { is_halted: true }, new Date()),
    ).rejects.toThrow('Liquidity.SetIsHalted: settings not found for id 1');
  });
});
