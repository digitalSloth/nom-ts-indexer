exports.up = async function (knex) {
  await knex.schema.createTable('nom_htlcs', (t) => {
    t.increments('id').primary();
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('time_locked_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('hash_locked_account_id')
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
    t.integer('unlock_account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('reclaim_account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    // 0 = SHA3-256, 1 = SHA-256
    t.smallint('hash_type').notNullable();
    t.smallint('key_max_size').notNullable();
    // HTLC id: the hash of the Create send block
    t.string('hash').notNullable().unique();
    t.string('amount').notNullable();
    t.string('hash_lock').notNullable();
    t.string('preimage');
    t.timestamp('expires_at').notNullable();
    t.timestamp('created_at').notNullable();
    t.timestamp('unlocked_at');
    t.timestamp('reclaimed_at');

    t.index('account_block_id');
    t.index('time_locked_account_id');
    t.index('hash_locked_account_id');
    t.index('token_id');
    t.index('hash_lock');
    t.index('created_at');
  });

  await knex.schema.createTable('nom_ptlcs', (t) => {
    t.increments('id').primary();
    t.integer('account_block_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('time_locked_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // NULL when Create passed the zero address: any holder of the witness may unlock
    t.integer('destination_account_id')
      .unsigned()
      .nullable()
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
    // The account paid at unlock: the Unlock sender or the ProxyUnlock destination
    t.integer('unlocked_to_account_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('unlock_account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('reclaim_account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // 0 = ED25519, 1 = BIP340, 2 = secp256k1 point
    t.smallint('point_type').notNullable();
    // Set by CreateWithReclaimLock only
    t.smallint('reclaim_point_type').nullable();
    // PTLC id: the hash of the Create send block
    t.string('hash').notNullable().unique();
    t.string('amount').notNullable();
    t.string('point_lock').notNullable();
    t.string('reclaim_point_lock').nullable();
    // Unlock witness, set at unlock
    t.text('signature').nullable();
    // Reclaim witness, set by ReclaimWithSignature only
    t.text('reclaim_signature').nullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('created_at').notNullable();
    t.timestamp('unlocked_at').nullable();
    t.timestamp('reclaimed_at').nullable();

    t.index('point_lock');
    t.index('time_locked_account_id');
    t.index('destination_account_id');
    t.index('unlocked_to_account_id');
    t.index('token_id');
    t.index('account_block_id');
    t.index('created_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_ptlcs');
  await knex.schema.dropTableIfExists('nom_htlcs');
};
