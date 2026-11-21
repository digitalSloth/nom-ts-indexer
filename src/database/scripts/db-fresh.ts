import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex from 'knex';
import knexConfig from '../knexfile.js';
import { db, connectDatabase, disconnectDatabase } from '../knex.js';
import { INDEXER_SCHEMA, ensureIndexerSchema } from '../schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

async function dbFresh() {
  await connectDatabase();

  // The indexer schema holds every table, including the Knex migration
  // tables.
  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [INDEXER_SCHEMA]);
  console.log(`Dropped schema ${INDEXER_SCHEMA}.`);

  await disconnectDatabase();

  // Re-run all migrations
  console.log('Running migrations...');
  const migrator = knex(knexConfig);
  try {
    await ensureIndexerSchema(migrator);
    const [batch, log] = await migrator.migrate.latest();
    if (log.length > 0) {
      console.log(`  Batch ${batch}: ${log.join(', ')}`);
    }
  } finally {
    await migrator.destroy();
  }

  console.log('\n✓ Database reset complete. Run `npm run db:seed` to load seed data.');
}

dbFresh().catch((err) => {
  console.error('db:fresh failed:', err.message);
  process.exit(1);
});
