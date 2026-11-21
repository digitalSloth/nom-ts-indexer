exports.up = async function (knex) {
  await knex.schema.createTable('nom_contracts', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.string('name').notNullable();

    t.index('account_id');
    t.index('name');
  });

  await knex.schema.createTable('nom_contract_methods', (t) => {
    t.increments('id').primary();
    t.integer('contract_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_contracts')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.string('name').notNullable();
    t.string('signature').notNullable();
    t.string('fingerprint').notNullable();

    t.index('contract_id');
    t.index('name');
    t.index('fingerprint');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_contract_methods');
  await knex.schema.dropTableIfExists('nom_contracts');
};
