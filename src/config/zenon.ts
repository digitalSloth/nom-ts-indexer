import dotenv from 'dotenv';

dotenv.config();

export interface ZenonConfig {
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  batchSize: number;
  debug: boolean;
  exitAfterSync: boolean;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const zenonConfig: ZenonConfig = {
  chainId: getEnvNumber('CHAIN_ID', 1), // 1 = mainnet, 3 = testnet
  rpcUrl: getEnvVar('ZNN_RPC_URL', 'http://localhost:35997'),
  wsUrl: getEnvVar('ZNN_WS_URL', 'ws://localhost:35998'),
  batchSize: getEnvNumber('BATCH_SIZE', 100),
  debug: getEnvBoolean('DEBUG', false),
  exitAfterSync: getEnvBoolean('EXIT_AFTER_SYNC', false),
};

// Validate configuration
function validateConfig(config: ZenonConfig): void {
  if (![1, 3].includes(config.chainId)) {
    console.warn(
      `Warning: Unexpected chain ID: ${config.chainId}. Expected 1 (mainnet) or 3 (testnet)`,
    );
  }

  if (!config.rpcUrl.startsWith('http://') && !config.rpcUrl.startsWith('https://')) {
    throw new Error(`Invalid RPC URL: ${config.rpcUrl}. Must start with http:// or https://`);
  }

  if (!config.wsUrl.startsWith('ws://') && !config.wsUrl.startsWith('wss://')) {
    throw new Error(`Invalid WebSocket URL: ${config.wsUrl}. Must start with ws:// or wss://`);
  }

  if (config.batchSize < 1 || config.batchSize > 1000) {
    throw new Error(`Invalid batch size: ${config.batchSize}. Must be between 1 and 1000`);
  }
}

// Validate on load
validateConfig(zenonConfig);

// Log configuration (excluding sensitive data)
if (zenonConfig.debug) {
  console.log('Zenon Configuration:', {
    chainId: zenonConfig.chainId,
    chainName:
      zenonConfig.chainId === 1 ? 'Mainnet' : zenonConfig.chainId === 3 ? 'Testnet' : 'Unknown',
    rpcUrl: zenonConfig.rpcUrl,
    wsUrl: zenonConfig.wsUrl,
    batchSize: zenonConfig.batchSize,
    debug: zenonConfig.debug,
  });
}
