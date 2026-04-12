import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const genesisPath: string = path.resolve(process.env.GENESIS_PATH || 'json/genesis.json');
