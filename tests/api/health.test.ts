import { describe, it, expect, vi, afterEach } from 'vitest';

const indexerService = {
  getStatus: vi.fn(),
};

vi.mock('../../src/services/indexer.js', () => ({ indexerService }));

const { healthCheck } = await import('../../src/api/health.js');

const stats = { momentums: 1000, accountBlocks: 5000, accounts: 200, tokens: 10, pillars: 50 };

afterEach(() => {
  delete process.env.INDEXER_IMAGE_TAG;
});

describe('healthCheck', () => {
  it('returns healthy status from indexer', async () => {
    indexerService.getStatus.mockResolvedValue({
      isRunning: true,
      state: 'realtime',
      currentHeight: BigInt(1000),
      targetHeight: BigInt(1002),
      lastProgressAt: '2026-01-01T00:00:00.000Z',
      lastError: null,
      node: 'wss://node',
      stats,
    });
    process.env.INDEXER_IMAGE_TAG = 'abc1234';

    const result = await healthCheck();

    expect(result).toEqual({
      healthy: true,
      state: 'realtime',
      currentHeight: '1000',
      targetHeight: '1002',
      lastProgressAt: '2026-01-01T00:00:00.000Z',
      lastError: null,
      node: 'wss://node',
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      imageTag: 'abc1234',
      stats,
    });
  });

  it('reports a paused state, a null frontier and no image tag', async () => {
    indexerService.getStatus.mockResolvedValue({
      isRunning: true,
      state: 'paused',
      currentHeight: BigInt(1000),
      targetHeight: null,
      lastProgressAt: null,
      lastError: { message: 'db down', at: '2026-01-01T00:00:00.000Z' },
      node: null,
      stats,
    });

    const result = await healthCheck();

    expect(result.state).toBe('paused');
    expect(result.targetHeight).toBeNull();
    expect(result.lastError).toEqual({ message: 'db down', at: '2026-01-01T00:00:00.000Z' });
    expect(result.imageTag).toBeNull();
  });

  it('returns unhealthy when indexer is not running', async () => {
    indexerService.getStatus.mockResolvedValue({
      isRunning: false,
      state: 'starting',
      currentHeight: BigInt(0),
      targetHeight: null,
      lastProgressAt: null,
      lastError: null,
      node: null,
      stats,
    });

    const result = await healthCheck();

    expect(result.healthy).toBe(false);
  });
});
