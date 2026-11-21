exports.up = async function (knex) {
  await knex.schema.createTable('indexer_state', (t) => {
    t.increments('id').primary();
    t.bigInteger('last_indexed_momentum').notNullable().defaultTo(0);
    t.boolean('is_running').notNullable().defaultTo(false);
    // Set once every seeder has finished, so a re-run skips seeding
    t.timestamp('seeded_at').nullable();
    t.timestamp('updated_at').notNullable();
  });

  await knex.schema.createTable('indexer_plugin_state', (t) => {
    t.increments('id').primary();
    t.bigInteger('watermark').notNullable().defaultTo(0);
    t.string('name').notNullable().unique();
    t.timestamp('updated_at').notNullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('indexer_plugin_state');
  await knex.schema.dropTableIfExists('indexer_state');
};
