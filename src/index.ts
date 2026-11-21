import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from './database/index.js';
import { indexerService } from './services/indexer.js';
import { zenonClient } from './services/zenon-client.js';
import { apiServer } from './api/server.js';
import { apiConfig } from './config/api.js';
import { zenonConfig } from './config/zenon.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Zenon Network Indexer
 */
async function main() {
  console.log('🌟 Zenon Network Indexer\n');

  try {
    // 1. Connect to database
    await connectDatabase();

    // 2. Start the API server
    await apiServer.start(apiConfig.port);

    // 3. Start the indexer service
    // The indexer will:
    // - Connect to Zenon RPC
    // - Fetch historical momentums in batches
    // - Index all account blocks (transactions)
    // - Switch to WebSocket for real-time sync when caught up
    await indexerService.start();

    if (zenonConfig.exitAfterSync) {
      await shutdown();
      return;
    }

    console.log('\n✓ Indexer is running. Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('Failed to start indexer:', error);
    await shutdown(1);
  }
}

/**
 * Gracefully shutdown the application, then exit with `exitCode`, or with
 * 1 if the shutdown itself fails.
 */
async function shutdown(exitCode = 0) {
  console.log('\n\n🛑 Shutting down...');

  try {
    // Stop the API server
    await apiServer.stop();

    // Stop the indexer
    await indexerService.stop();

    // Disconnect Zenon client
    await zenonClient.disconnect();

    // Disconnect from database
    await disconnectDatabase();

    console.log('✓ Shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown(1);
});

// Start the application
main();
