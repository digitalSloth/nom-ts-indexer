exports.up = async function (knex) {
  await knex.schema.createTable('nom_sentinels', (t) => {
    t.increments('id').primary();
    t.integer('owner_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.timestamp('created_at').notNullable();
    t.timestamp('revoked_at');

    t.index('owner_id');
    t.index('created_at');
    t.index('revoked_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_sentinels');
};
