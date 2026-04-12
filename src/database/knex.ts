import knex from 'knex';
import 'dotenv/config';

// ─── Knex singleton ─────────────────────────────────────────────────

const knexSingleton = () => {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
      database: process.env.DATABASE_NAME || 'zenon_indexer',
    },
    pool: {
      min: 2,
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
    },
  });
};

declare global {
  // eslint-disable-next-line no-var
  var dbGlobal: undefined | ReturnType<typeof knexSingleton>;
}

export const db = globalThis.dbGlobal ?? knexSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.dbGlobal = db;
}

/**
 * Connect to database
 */
export async function connectDatabase(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    console.log('✓ Database connected');
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await db.destroy();
  console.log('✓ Database disconnected');
}
