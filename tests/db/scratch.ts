import knex from 'knex';
import type { Knex } from 'knex';
import knexConfig from '../../src/database/knexfile.js';
import { ensureIndexerSchema } from '../../src/database/schema.js';

export function connect(database: string): Knex {
  const { searchPath, ...base } = knexConfig;
  return knex({
    ...base,
    searchPath,
    connection: {
      ...(knexConfig.connection as Knex.PgConnectionConfig),
      database,
    },
    pool: { min: 0, max: 4 },
  });
}

/** Throws unless `name` is a scratch database that is not the configured one. */
export function assertScratchName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*_test$/.test(name) || name === process.env.DATABASE_NAME) {
    throw new Error(`"${name}" is not a safe scratch database name`);
  }
}

export async function createScratchDatabase(name: string): Promise<Knex> {
  assertScratchName(name);
  const admin = connect('postgres');
  try {
    await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [name]);
    await admin.raw('CREATE DATABASE ??', [name]);
  } finally {
    await admin.destroy();
  }
  const db = connect(name);
  await ensureIndexerSchema(db);
  await db.migrate.latest();
  return db;
}

export async function dropScratchDatabase(db: Knex | undefined, name: string): Promise<void> {
  assertScratchName(name);
  await db?.destroy();
  const admin = connect('postgres');
  try {
    await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [name]);
  } finally {
    await admin.destroy();
  }
}
