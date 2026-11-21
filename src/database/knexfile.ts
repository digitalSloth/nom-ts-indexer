import type { Knex } from 'knex';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseSsl } from './ssl.js';
import { INDEXER_SCHEMA } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root (two directories up from src/database/)
config({ path: path.resolve(__dirname, '../../.env') });

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'zenon_indexer',
    ssl: databaseSsl(),
  },
  searchPath: [INDEXER_SCHEMA],
  pool: {
    min: 2,
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  },
  migrations: {
    directory: [path.join(__dirname, 'migrations'), path.join(__dirname, 'migrations/plugins')],
    extension: 'cjs',
  },
};

export default knexConfig;
