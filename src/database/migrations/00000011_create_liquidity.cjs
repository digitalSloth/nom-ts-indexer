exports.up = async function (knex) {
  await knex.schema.createTable('nom_liquidity_admins', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('nominated_by_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.timestamp('nominated_at');
    t.timestamp('accepted_at');
    t.timestamp('revoked_at');

    t.index('account_id');
    t.index('nominated_by_id');
  });

  await knex.schema.createTable('nom_liquidity_guardians', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.timestamp('nominated_at').notNullable();
    t.timestamp('accepted_at');
    t.timestamp('revoked_at');

    t.index('account_id');
  });

  await knex.schema.createTable('nom_liquidity_settings', (t) => {
    t.increments('id').primary();
    // Extra ZNN and QSR paid to liquidity stakers each epoch
    t.string('znn_reward').notNullable().defaultTo('0');
    t.string('qsr_reward').notNullable().defaultTo('0');
    t.boolean('is_halted').notNullable().defaultTo(false);
    t.timestamp('updated_at');
  });

  await knex.schema.createTable('nom_liquidity_token_tuples', (t) => {
    t.increments('id').primary();
    t.integer('token_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // Share of liquidity rewards in basis points (10000 = 100%)
    t.integer('znn_percentage').notNullable();
    t.integer('qsr_percentage').notNullable();
    t.string('min_amount').notNullable();
    t.timestamp('created_at').notNullable();

    t.unique('token_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_liquidity_token_tuples');
  await knex.schema.dropTableIfExists('nom_liquidity_settings');
  await knex.schema.dropTableIfExists('nom_liquidity_guardians');
  await knex.schema.dropTableIfExists('nom_liquidity_admins');
};
