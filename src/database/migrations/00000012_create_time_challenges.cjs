exports.up = async function (knex) {
  await knex.schema.createTable('nom_time_challenges', (t) => {
    t.increments('id').primary();
    t.integer('contract_method_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_contract_methods')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.bigInteger('delay').notNullable().defaultTo(0);
    t.bigInteger('start_height');
    t.bigInteger('end_height');
    t.string('hash').notNullable().defaultTo('0');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('expires_at');
    t.timestamp('created_at');

    t.index('contract_method_id');
    t.index('expires_at');
    t.index('created_at');
  });
  // The indexer sets expires_at when the momentum after end_height arrives.
  await knex.raw(
    'CREATE INDEX nom_time_challenges_unexpired_end_height_index ON nom_time_challenges (end_height) WHERE expires_at IS NULL',
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_time_challenges');
};
