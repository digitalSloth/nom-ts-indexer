import knex from 'knex';
import knexConfig from '../knexfile.js';
import { ensureIndexerSchema } from '../schema.js';

async function dbMigrate() {
  const migrator = knex(knexConfig);
  try {
    await ensureIndexerSchema(migrator);
    const [batch, log] = await migrator.migrate.latest();
    console.log(log.length > 0 ? `Batch ${batch}: ${log.join(', ')}` : 'Already up to date.');
  } finally {
    await migrator.destroy();
  }
}

dbMigrate().catch((err) => {
  console.error('db:migrate failed:', err.message);
  process.exit(1);
});
