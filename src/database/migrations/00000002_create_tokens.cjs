exports.up = async function (knex) {
  await knex.schema.createTable('nom_tokens', (t) => {
    t.increments('id').primary();
    t.integer('owner_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('decimals').notNullable();
    t.string('name').notNullable();
    t.string('symbol').notNullable();
    t.string('domain').notNullable();
    t.string('token_standard').notNullable().unique();
    t.string('total_supply').notNullable().defaultTo('0');
    t.string('initial_supply').defaultTo('0');
    t.string('max_supply').notNullable().defaultTo('0');
    t.boolean('is_burnable').notNullable().defaultTo(true);
    t.boolean('is_mintable').notNullable().defaultTo(true);
    t.boolean('is_utility').notNullable().defaultTo(true);
    t.timestamp('created_at');
    t.timestamp('updated_at');

    t.index('owner_id');
    t.index('name');
    t.index('symbol');
    t.index('created_at');
    t.index('updated_at');
  });

  await knex.schema.createTable('nom_account_tokens', (t) => {
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
    t.string('balance').notNullable().defaultTo('0');
    // Lifetime totals; genesis balances count as received, so
    // balance = received - sent.
    t.string('sent').notNullable().defaultTo('0');
    t.string('received').notNullable().defaultTo('0');
    t.timestamp('updated_at').notNullable();

    t.primary(['account_id', 'token_id']);
  });
  await knex.raw(
    'CREATE INDEX nom_account_tokens_token_id_balance_numeric_desc_index ON nom_account_tokens (token_id, (balance::numeric) DESC)',
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_account_tokens');
  await knex.schema.dropTableIfExists('nom_tokens');
};
