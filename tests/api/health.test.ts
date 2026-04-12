import { describe, it, expect, vi } from 'vitest';

const indexerService = {
  getStatus: vi.fn(),
};

vi.mock('../../src/services/indexer.js', () => ({ indexerService }));

const { healthCheck } = await import('../../src/api/health.js');

describe('healthCheck', () => {
  it('returns healthy status from indexer', async () => {
    indexerService.getStatus.mockResolvedValue({
      isRunning: true,
      currentHeight: BigInt(1000),
      stats: { momentums: 1000, accountBlocks: 5000, accounts: 200, tokens: 10, pillars: 50 },
    });

    const result = await healthCheck();

    expect(result).toEqual({
      healthy: true,
      currentHeight: '1000',
      stats: { momentums: 1000, accountBlocks: 5000, accounts: 200, tokens: 10, pillars: 50 },
    });
  });

  it('returns unhealthy when indexer is not running', async () => {
    indexerService.getStatus.mockResolvedValue({
      isRunning: false,
      currentHeight: BigInt(0),
      stats: { momentums: 0, accountBlocks: 0, accounts: 0, tokens: 0, pillars: 0 },
    });

    const result = await healthCheck();

    expect(result.healthy).toBe(false);
  });
});
