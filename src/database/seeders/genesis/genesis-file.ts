import { promises as fs } from 'fs';
import { genesisPath } from '../../../config/genesis.js';

/** Read and parse the genesis file named by GENESIS_PATH. */
export async function readGenesis<T>(): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(genesisPath, 'utf-8')) as T;
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }
}

/** The genesis momentum time, from the file's GenesisTimestampSec. */
export function genesisTimestamp(genesis: { GenesisTimestampSec: number }): Date {
  if (!Number.isFinite(genesis.GenesisTimestampSec)) {
    throw new Error(`${genesisPath} has no GenesisTimestampSec`);
  }
  return new Date(genesis.GenesisTimestampSec * 1000);
}
