exports.up = async function (knex) {
  await knex.schema.createTable('nom_token_mints', (t) => {
    t.increments('id').primary();
    t.integer('token_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('issuer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('receiver_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.string('amount').notNullable();
    t.timestamp('created_at').notNullable();

    t.index('token_id');
    t.index('issuer_id');
    t.index('receiver_id');
    t.index('account_block_id');
    t.index('created_at');
  });
  await knex.raw(
    'CREATE INDEX nom_token_mints_token_id_id_desc_index ON nom_token_mints (token_id, id DESC)',
  );

  await knex.schema.createTable('nom_token_burns', (t) => {
    t.increments('id').primary();
    t.integer('token_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.string('amount').notNullable();
    t.timestamp('created_at').notNullable();

    t.index('token_id');
    t.index('account_id');
    t.index('account_block_id');
    t.index('created_at');
  });
  await knex.raw(
    'CREATE INDEX nom_token_burns_token_id_id_desc_index ON nom_token_burns (token_id, id DESC)',
  );

  await knex.schema.createTable('nom_account_rewards', (t) => {
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
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.string('type').notNullable();
    t.string('amount').notNullable().defaultTo('0');
    t.timestamp('created_at').notNullable();

    t.index('token_id');
    t.index('account_block_id');
    t.index('type');
    t.index('created_at');
  });
  await knex.raw(
    'CREATE INDEX nom_account_rewards_account_id_id_desc_index ON nom_account_rewards (account_id, id DESC)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_rewards_account_id_type_id_desc_index ON nom_account_rewards (account_id, type, id DESC)',
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_account_rewards');
  await knex.schema.dropTableIfExists('nom_token_burns');
  await knex.schema.dropTableIfExists('nom_token_mints');
};
