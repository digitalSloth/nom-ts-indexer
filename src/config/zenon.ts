import dotenv from 'dotenv';

dotenv.config();

export interface ZenonConfig {
  chainId: number;
  /** WebSocket endpoints in priority order. The first is the primary. */
  wsUrls: string[];
  batchSize: number;
  debug: boolean;
  exitAfterSync: boolean;
  stallExitSeconds: number;
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

/** Splits a comma-separated list, dropping blanks. */
export function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const zenonConfig: ZenonConfig = {
  chainId: getEnvNumber('CHAIN_ID', 1), // 1 = mainnet, 3 = testnet
  wsUrls: parseList(getEnvVar('ZNN_WS_URL', 'ws://localhost:35998')),
  batchSize: getEnvNumber('BATCH_SIZE', 100),
  debug: getEnvBoolean('DEBUG', false),
  exitAfterSync: getEnvBoolean('EXIT_AFTER_SYNC', false),
  stallExitSeconds: getEnvNumber('STALL_EXIT_SECONDS', 300),
};

// Validate configuration
function validateConfig(config: ZenonConfig): void {
  if (![1, 3].includes(config.chainId)) {
    console.warn(
      `Warning: Unexpected chain ID: ${config.chainId}. Expected 1 (mainnet) or 3 (testnet)`,
    );
  }

  if (config.wsUrls.length === 0) {
    throw new Error('ZNN_WS_URL must list at least one WebSocket URL');
  }

  for (const url of config.wsUrls) {
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      throw new Error(`Invalid WebSocket URL: ${url}. Must start with ws:// or wss://`);
    }
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
    wsUrls: zenonConfig.wsUrls,
    batchSize: zenonConfig.batchSize,
    debug: zenonConfig.debug,
  });
}
