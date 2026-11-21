exports.up = async function (knex) {
  await knex.schema.createTable('nom_stakes', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('token_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.bigInteger('duration').notNullable();
    t.string('amount').notNullable().defaultTo('0');
    t.timestamp('started_at').notNullable();
    // When the stake can be cancelled: started_at + duration, or earlier if
    // the liquidity administrator unlocks the token's stakes
    t.timestamp('expires_at').notNullable();
    t.timestamp('ended_at');

    t.index('account_id');
    t.index('token_id');
    t.index('account_block_id');
    t.index('duration');
    t.index('started_at');
    t.index('ended_at');
  });
  await knex.raw(
    'CREATE INDEX nom_stakes_active_token_id_started_at_index ON nom_stakes (token_id, started_at DESC) WHERE ended_at IS NULL',
  );

  await knex.schema.createTable('nom_plasma', (t) => {
    t.increments('id').primary();
    t.integer('from_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('to_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // Null for fusions seeded from genesis
    t.integer('account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // Height from which the fuser can cancel. Null for genesis fusions
    // without a Fuse block.
    t.bigInteger('expiration_height').nullable();
    // Fusion id: the hash of the Fuse send block
    t.string('hash').notNullable().unique();
    t.string('amount').notNullable();
    t.timestamp('started_at').notNullable();
    t.timestamp('ended_at');

    t.index('from_account_id');
    t.index('to_account_id');
    t.index('account_block_id');
    t.index('started_at');
    t.index('ended_at');
  });
  await knex.raw(
    'CREATE INDEX nom_plasma_active_started_at_index ON nom_plasma (started_at DESC) WHERE ended_at IS NULL',
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_plasma');
  await knex.schema.dropTableIfExists('nom_stakes');
};
