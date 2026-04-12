import { indexerService } from '../services/indexer.js';

export async function healthCheck() {
  const status = await indexerService.getStatus();
  return {
    healthy: status.isRunning,
    currentHeight: status.currentHeight.toString(),
    stats: status.stats,
  };
}
