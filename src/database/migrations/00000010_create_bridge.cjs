exports.up = async function (knex) {
  await knex.schema.createTable('nom_bridge_admins', (t) => {
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

  await knex.schema.createTable('nom_bridge_guardians', (t) => {
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

  await knex.schema.createTable('nom_bridge_networks', (t) => {
    t.increments('id').primary();
    t.bigInteger('chain_identifier').notNullable();
    t.bigInteger('network_class').notNullable();
    t.string('name').notNullable();
    t.string('contract_address').notNullable();
    t.string('total_znn_wrapped');
    t.string('total_znn_unwrapped');
    t.string('total_znn_held');
    t.string('total_qsr_wrapped');
    t.string('total_qsr_unwrapped');
    t.string('total_qsr_held');
    t.text('meta_data');
    t.timestamp('created_at');
    t.timestamp('updated_at');
    t.timestamp('deleted_at');

    t.index('name');
  });

  await knex.schema.createTable('nom_bridge_network_tokens', (t) => {
    t.increments('id').primary();
    t.integer('bridge_network_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_bridge_networks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('token_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_tokens')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('fee_percentage').notNullable();
    t.integer('redeem_delay').notNullable();
    t.string('token_address').notNullable();
    t.string('min_amount').notNullable();
    t.text('metadata');
    t.boolean('is_bridgeable').notNullable().defaultTo(false);
    t.boolean('is_redeemable').notNullable().defaultTo(false);
    t.boolean('is_owned').notNullable().defaultTo(false);
    t.timestamp('created_at');
    t.timestamp('updated_at');

    t.index('bridge_network_id');
    t.index('token_id');
    t.unique(['bridge_network_id', 'token_id']);
  });

  await knex.schema.createTable('nom_bridge_wraps', (t) => {
    t.increments('id').primary();
    t.integer('bridge_network_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_bridge_networks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
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
    t.bigInteger('creation_momentum_height').notNullable().defaultTo(0);
    t.string('to_address').notNullable();
    t.string('amount').notNullable().defaultTo('0');
    // Bridge fee kept by the contract: amount * fee_percentage / 10000
    t.string('fee').notNullable().defaultTo('0');
    t.text('signature');
    t.timestamp('created_at');
    t.timestamp('updated_at');

    t.index('bridge_network_id');
    t.index('account_id');
    t.index('token_id');
    t.index('account_block_id');
  });

  await knex.schema.createTable('nom_bridge_unwraps', (t) => {
    t.increments('id').primary();
    t.integer('bridge_network_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_bridge_networks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('to_account_id')
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
    t.bigInteger('log_index').notNullable();
    t.string('transaction_hash').notNullable();
    t.string('amount').notNullable();
    t.text('signature');
    t.timestamp('redeemed_at');
    t.timestamp('revoked_at');
    t.timestamp('created_at');
    t.timestamp('updated_at');

    t.index('bridge_network_id');
    t.index('to_account_id');
    t.index('token_id');
    t.index('account_block_id');
  });
  await knex.raw(
    'CREATE UNIQUE INDEX nom_bridge_unwraps_transaction_hash_log_index_unique ON nom_bridge_unwraps (transaction_hash, log_index)',
  );

  await knex.schema.createTable('nom_bridge_settings', (t) => {
    t.increments('id').primary();
    t.bigInteger('tss_nonce').notNullable().defaultTo(0);
    t.bigInteger('allow_key_gen_height').notNullable().defaultTo(0);
    t.bigInteger('unhalted_at_height').notNullable().defaultTo(0);
    t.bigInteger('unhalt_duration').notNullable().defaultTo(0);
    t.bigInteger('window_size').notNullable().defaultTo(0);
    t.bigInteger('key_gen_threshold').notNullable().defaultTo(0);
    t.bigInteger('confirmations_to_finality').notNullable().defaultTo(0);
    t.bigInteger('estimated_momentum_time').notNullable().defaultTo(0);
    t.string('compressed_tss_ecdsa_pub_key');
    t.text('decompressed_tss_ecdsa_pub_key');
    t.text('metadata');
    t.boolean('allow_key_gen').notNullable().defaultTo(false);
    // The bridge stays halted until unhalted_at_height + unhalt_duration
    t.boolean('is_halted').notNullable().defaultTo(false);
    t.timestamp('halted_at');
    t.timestamp('unhalted_at');
    t.timestamp('updated_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_bridge_settings');
  await knex.schema.dropTableIfExists('nom_bridge_unwraps');
  await knex.schema.dropTableIfExists('nom_bridge_wraps');
  await knex.schema.dropTableIfExists('nom_bridge_network_tokens');
  await knex.schema.dropTableIfExists('nom_bridge_networks');
  await knex.schema.dropTableIfExists('nom_bridge_guardians');
  await knex.schema.dropTableIfExists('nom_bridge_admins');
};
