import { indexerService } from '../services/indexer.js';

const startedAt = Date.now();

export async function healthCheck() {
  const status = await indexerService.getStatus();
  return {
    healthy: status.isRunning,
    state: status.state,
    currentHeight: status.currentHeight.toString(),
    targetHeight: status.targetHeight?.toString() ?? null,
    lastProgressAt: status.lastProgressAt,
    lastError: status.lastError,
    node: status.node,
    startedAt: new Date(startedAt).toISOString(),
    imageTag: process.env.INDEXER_IMAGE_TAG || null,
    stats: status.stats,
  };
}
