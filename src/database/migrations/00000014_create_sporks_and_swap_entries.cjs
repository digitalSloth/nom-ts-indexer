exports.up = async function (knex) {
  await knex.schema.createTable('nom_sporks', (t) => {
    t.increments('id').primary();
    // Null for sporks seeded from genesis
    t.integer('account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.bigInteger('enforcement_height');
    // Spork id: the hash of the CreateSpork send block
    t.string('hash').notNullable().unique();
    t.string('name').notNullable();
    t.text('description').notNullable();
    t.boolean('is_active').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable();
    t.timestamp('activated_at');

    t.index('account_block_id');
  });

  await knex.schema.createTable('nom_swap_entries', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('account_block_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_account_blocks')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    // Legacy swap entries from genesis, keyed by sha256(ripemd160(sha256(compressed key)))
    t.string('key_id_hash').notNullable().unique();
    t.string('znn').notNullable();
    t.string('qsr').notNullable();
    // Amounts paid out after decay
    t.string('retrieved_znn');
    t.string('retrieved_qsr');
    t.text('public_key');
    t.timestamp('retrieved_at');

    t.index('account_id');
    t.index('account_block_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_swap_entries');
  await knex.schema.dropTableIfExists('nom_sporks');
};
