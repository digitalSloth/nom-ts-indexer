exports.up = async function (knex) {
  await knex.schema.createTable('rewards_tracker_rewards', (t) => {
    t.increments('id').primary();
    t.integer('account_id').notNullable().index();
    t.integer('token_id').notNullable();
    t.integer('account_block_id').notNullable().unique();
    t.string('type', 32).notNullable().index();
    t.string('amount', 64).notNullable();
    t.timestamp('created_at').notNullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rewards_tracker_rewards');
};
