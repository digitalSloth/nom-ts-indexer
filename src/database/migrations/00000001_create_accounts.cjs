exports.up = async function (knex) {
  await knex.schema.createTable('nom_accounts', (t) => {
    t.increments('id').primary();
    t.string('address').notNullable().unique();
    t.string('name');
    t.text('public_key');
    t.boolean('is_embedded_contract').notNullable().defaultTo(false);
    // HTLC contract setting: anyone may unlock this account's HTLCs with the preimage
    t.boolean('is_htlc_proxy_unlock_allowed').notNullable().defaultTo(true);
    t.timestamp('first_active_at');
    t.timestamp('last_active_at');

    t.index('name');
    t.index('first_active_at');
    t.index('last_active_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_accounts');
};
