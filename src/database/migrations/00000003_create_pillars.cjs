exports.up = async function (knex) {
  await knex.schema.createTable('nom_pillars', (t) => {
    t.increments('id').primary();
    t.integer('owner_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('producer_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('withdraw_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.bigInteger('qsr_burn').notNullable().defaultTo(15000000000000);
    t.integer('rank').notNullable().defaultTo(0);
    t.integer('produced_momentums').notNullable().defaultTo(0);
    t.integer('momentum_rewards').notNullable().defaultTo(0);
    t.integer('delegate_rewards').notNullable().defaultTo(0);
    t.decimal('az_engagement', 5, 2).nullable();
    t.bigInteger('az_avg_vote_time').nullable();
    t.bigInteger('total_momentums_produced').notNullable().defaultTo(0);
    t.string('name').notNullable();
    t.string('slug').notNullable();
    t.string('weight').notNullable().defaultTo('0');
    t.boolean('is_legacy').notNullable().defaultTo(false);
    t.timestamp('revoked_at');
    t.timestamp('created_at').notNullable();
    t.timestamp('updated_at');

    t.index('owner_id');
    t.index('producer_account_id');
    t.index('withdraw_account_id');
    t.index('name');
    t.index('slug');
    t.index('weight');
    t.index('rank');
    t.index('az_engagement');
    t.index('az_avg_vote_time');
    t.index('total_momentums_produced');
    t.index('created_at');
    t.index('updated_at');
  });

  await knex.schema.createTable('nom_pillar_update_histories', (t) => {
    t.increments('id').primary();
    t.integer('pillar_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_pillars')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('producer_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('withdraw_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('momentum_rewards').notNullable().defaultTo(0);
    t.integer('delegate_rewards').notNullable().defaultTo(0);
    t.boolean('is_reward_change').notNullable().defaultTo(false);
    t.timestamp('updated_at').notNullable();

    t.index('pillar_id');
    t.index('producer_account_id');
    t.index('withdraw_account_id');
  });

  await knex.schema.createTable('nom_delegations', (t) => {
    t.increments('id').primary();
    t.integer('pillar_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_pillars')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.timestamp('started_at').notNullable();
    t.timestamp('ended_at');

    t.index('account_id');
    t.index(['pillar_id', 'account_id']);
    t.index('started_at');
    t.index('ended_at');
  });
  await knex.raw(
    'CREATE INDEX nom_delegations_active_pillar_id_index ON nom_delegations (pillar_id, account_id) WHERE ended_at IS NULL',
  );

  await knex.schema.createTable('nom_legacy_pillar_entries', (t) => {
    t.increments('id').primary();
    t.integer('pillar_count').notNullable();
    // Slots left after RegisterLegacy calls
    t.integer('remaining_count').notNullable();
    // Legacy pillar slots from genesis, keyed like nom_swap_entries
    t.string('key_id_hash').notNullable().unique();
  });

  await knex.schema.createTable('nom_qsr_deposits', (t) => {
    t.increments('id').primary();
    t.integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    // The pillar or sentinel contract holding the deposit
    t.integer('contract_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.string('amount').notNullable().defaultTo('0');
    t.timestamp('updated_at').notNullable();

    t.unique(['account_id', 'contract_account_id']);
    t.index('contract_account_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_qsr_deposits');
  await knex.schema.dropTableIfExists('nom_legacy_pillar_entries');
  await knex.schema.dropTableIfExists('nom_delegations');
  await knex.schema.dropTableIfExists('nom_pillar_update_histories');
  await knex.schema.dropTableIfExists('nom_pillars');
};
