exports.up = async function (knex) {
  await knex.schema.createTable('nom_momentums', (t) => {
    t.increments('id').primary();
    t.integer('producer_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('producer_pillar_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_pillars')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('version').notNullable().defaultTo(1);
    t.bigInteger('height').notNullable().unique();
    t.string('hash').notNullable().unique();
    t.text('data');
    t.timestamp('created_at').notNullable();

    t.index('producer_account_id');
    t.index('producer_pillar_id');
    t.index('created_at');
  });
  await knex.raw(
    'CREATE INDEX nom_momentums_producer_pillar_id_height_desc_index ON nom_momentums (producer_pillar_id, height DESC)',
  );

  await knex.schema.createTable('nom_account_blocks', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
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
    t.integer('momentum_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_momentums')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('momentum_acknowledged_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_momentums')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('parent_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('NO ACTION')
      .onUpdate('NO ACTION');
    t.integer('paired_account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('NO ACTION')
      .onUpdate('NO ACTION');
    t.integer('token_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('contract_method_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_contract_methods')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('version').notNullable().defaultTo(1);
    t.integer('block_type').notNullable();
    t.bigInteger('height').notNullable();
    t.bigInteger('fused_plasma').notNullable().defaultTo(0);
    t.bigInteger('base_plasma').notNullable().defaultTo(0);
    t.bigInteger('used_plasma').notNullable().defaultTo(0);
    t.bigInteger('difficulty').notNullable().defaultTo(0);
    // Contract receive blocks only: 1 = call succeeded, 2 = failed and rolled back
    t.smallint('call_status').nullable();
    t.string('amount').notNullable().defaultTo('0');
    t.string('hash').notNullable().unique();
    t.text('nonce');
    t.boolean('call_failed').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable();

    t.index('momentum_id');
    t.index('parent_id');
    t.index('paired_account_block_id');
    t.index('contract_method_id');
    t.index('created_at');
    t.index(['to_account_id', 'token_id', 'id']);
    t.index(['account_id', 'to_account_id', 'token_id']);
  });
  await knex.raw(
    'CREATE INDEX nom_account_blocks_account_id_id_desc_index ON nom_account_blocks (account_id, id DESC)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_to_account_id_id_desc_index ON nom_account_blocks (to_account_id, id DESC)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_token_id_id_desc_index ON nom_account_blocks (token_id, id DESC)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_account_id_id_desc_listed_index ON nom_account_blocks (account_id, id DESC) WHERE block_type IN (1, 2, 4)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_account_id_height_index ON nom_account_blocks (account_id, height)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_unreceived_index ON nom_account_blocks (id) WHERE paired_account_block_id IS NULL AND block_type IN (2, 4)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_account_id_token_id_id_desc_index ON nom_account_blocks (account_id, token_id, id DESC)',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_account_id_call_failed_index ON nom_account_blocks (account_id, id DESC) WHERE call_failed',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_to_account_id_call_failed_index ON nom_account_blocks (to_account_id, id DESC) WHERE call_failed',
  );
  await knex.raw(
    'CREATE INDEX nom_account_blocks_token_id_call_failed_index ON nom_account_blocks (token_id, id DESC) WHERE call_failed',
  );

  await knex.schema.createTable('nom_account_block_data', (t) => {
    t.increments('id').primary();
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.text('raw').notNullable();
    t.text('decoded');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_account_block_data');
  await knex.schema.dropTableIfExists('nom_account_blocks');
  await knex.schema.dropTableIfExists('nom_momentums');
};
