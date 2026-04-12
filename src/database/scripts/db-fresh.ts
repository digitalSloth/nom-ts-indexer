import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex from 'knex';
import knexConfig from '../knexfile.js';
import { db, connectDatabase, disconnectDatabase } from '../knex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

async function dbFresh() {
  await connectDatabase();

  // Get all user-defined tables (exclude knex internals)
  const tables = await db.raw(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'knex_%'
  `);

  const tableNames = tables.rows.map((r: { tablename: string }) => r.tablename);

  if (tableNames.length === 0) {
    console.log('No tables to drop.');
  } else {
    const dropQuery = tableNames
      .map((name: string) => `DROP TABLE IF EXISTS "${name}" CASCADE`)
      .join(';\n');
    await db.raw(dropQuery);
    console.log(`Dropped ${tableNames.length} tables.`);
  }

  // Clean up knex migration tracking
  await db.raw('DROP TABLE IF EXISTS knex_migrations CASCADE');
  await db.raw('DROP TABLE IF EXISTS knex_migrations_lock CASCADE');

  await disconnectDatabase();

  // Re-run all migrations
  console.log('Running migrations...');
  const migrator = knex(knexConfig);
  try {
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
