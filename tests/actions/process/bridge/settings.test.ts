import { describe, it, expect, vi } from 'vitest';

const { updateBridgeSettings } = await import('../../../../src/actions/process/bridge/settings.js');

describe('updateBridgeSettings', () => {
  it('throws when the seeded settings row is missing', async () => {
    const update = vi.fn(async () => 0);
    const tx: any = vi.fn(() => ({ where: () => ({ update }) }));

    await expect(updateBridgeSettings(tx, 'Halt', { is_halted: true }, new Date())).rejects.toThrow(
      'Bridge.Halt: settings not found for id 1',
    );
  });
});
