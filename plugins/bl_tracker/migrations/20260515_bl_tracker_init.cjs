/**
 * Baseline migration for bl_tracker plugin.
 * Creates bl_tracker_balances table.
 */

exports.up = function (knex) {
  return knex.schema.createTable('bl_tracker_balances', (t) => {
    t.increments('id').primary();
    t.integer('account_id').notNullable().unique();
    t.string('znn_balance').notNullable().defaultTo('0');
    t.string('qsr_balance').notNullable().defaultTo('0');
    t.string('znn_sent').notNullable().defaultTo('0');
    t.string('znn_received').notNullable().defaultTo('0');
    t.string('qsr_sent').notNullable().defaultTo('0');
    t.string('qsr_received').notNullable().defaultTo('0');
    t.string('znn_staked').notNullable().defaultTo('0');
    t.string('qsr_fused').notNullable().defaultTo('0');
    t.string('plasma_amount').notNullable().defaultTo('0');
    t.string('znn_rewards').notNullable().defaultTo('0');
    t.string('qsr_rewards').notNullable().defaultTo('0');
    t.string('genesis_znn_balance').notNullable().defaultTo('0');
    t.string('genesis_qsr_balance').notNullable().defaultTo('0');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('bl_tracker_balances');
};
