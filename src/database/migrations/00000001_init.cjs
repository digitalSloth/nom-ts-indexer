/**
 * Baseline migration — converted from prisma/migrations/20260515160318_init/migration.sql
 * 28 tables, ~80 indexes, ~45 foreign key constraints.
 * Uses knex builder syntax exclusively for cross-database portability.
 */

exports.up = function (knex) {
  return knex.schema
    // ─── nom_accounts ───────────────────────────────────────────────
    .createTable('nom_accounts', (t) => {
      t.increments('id').primary();
      t.string('address').notNullable().unique();
      t.string('name');
      t.text('public_key');
      t.boolean('is_embedded_contract').notNullable().defaultTo(false);
      t.timestamp('first_active_at');
      t.timestamp('last_active_at');

      t.index('name');
      t.index('first_active_at');
      t.index('last_active_at');
    })

    // ─── nom_tokens ─────────────────────────────────────────────────
    .createTable('nom_tokens', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('name').notNullable();
      t.string('symbol').notNullable();
      t.string('domain').notNullable();
      t.string('token_standard').notNullable().unique();
      t.string('total_supply').notNullable().defaultTo('0');
      t.string('initial_supply').notNullable().defaultTo('0');
      t.string('max_supply').notNullable().defaultTo('0');
      t.integer('decimals').notNullable();
      t.boolean('is_burnable').notNullable().defaultTo(true);
      t.boolean('is_mintable').notNullable().defaultTo(true);
      t.boolean('is_utility').notNullable().defaultTo(true);
      t.timestamp('created_at');
      t.timestamp('updated_at');

      t.index('owner_id');
      t.index('name');
      t.index('symbol');
      t.index('created_at');
      t.index('updated_at');
    })

    // ─── nom_pillars ────────────────────────────────────────────────
    .createTable('nom_pillars', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('producer_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('withdraw_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('name').notNullable();
      t.string('slug').notNullable();
      t.bigInteger('qsr_burn').notNullable().defaultTo(15000000000000);
      t.string('weight').notNullable().defaultTo('0');
      t.integer('rank').notNullable().defaultTo(0);
      t.integer('produced_momentums').notNullable().defaultTo(0);
      t.integer('expected_momentums').notNullable().defaultTo(0);
      t.integer('missed_momentums').notNullable().defaultTo(0);
      t.integer('momentum_rewards').notNullable().defaultTo(0);
      t.integer('delegate_rewards').notNullable().defaultTo(0);
      t.decimal('owner_apr', 8, 2).notNullable().defaultTo(0);
      t.decimal('delegate_apr', 8, 2).notNullable().defaultTo(0);
      t.decimal('az_engagement', 5, 2).nullable();
      t.bigInteger('az_avg_vote_time').nullable();
      t.integer('avg_momentums_produced').notNullable().defaultTo(0);
      t.bigInteger('total_momentums_produced').notNullable().defaultTo(0);
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
      t.index('avg_momentums_produced');
      t.index('total_momentums_produced');
      t.index('created_at');
      t.index('updated_at');
    })

    // ─── nom_contracts ──────────────────────────────────────────────
    .createTable('nom_contracts', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().nullable()
        .references('id').inTable('nom_accounts')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.string('name').notNullable();

      t.index('account_id');
      t.index('name');
    })

    // ─── nom_contract_methods ───────────────────────────────────────
    .createTable('nom_contract_methods', (t) => {
      t.increments('id').primary();
      t.integer('contract_id').unsigned().nullable()
        .references('id').inTable('nom_contracts')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.string('name').notNullable();
      t.string('signature').notNullable();
      t.string('fingerprint').notNullable();

      t.index('contract_id');
      t.index('name');
      t.index('fingerprint');
    })

    // ─── nom_momentums ──────────────────────────────────────────────
    .createTable('nom_momentums', (t) => {
      t.increments('id').primary();
      t.integer('producer_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('producer_pillar_id').unsigned().nullable()
        .references('id').inTable('nom_pillars')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.integer('version').notNullable().defaultTo(1);
      t.bigInteger('height').notNullable().unique();
      t.string('hash').notNullable().unique();
      t.text('data');
      t.timestamp('created_at').notNullable();

      t.index('producer_account_id');
      t.index('producer_pillar_id');
      t.index('created_at');
    })

    // ─── nom_account_blocks ─────────────────────────────────────────
    .createTable('nom_account_blocks', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('to_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('momentum_id').unsigned().notNullable()
        .references('id').inTable('nom_momentums')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('momentum_acknowledged_id').unsigned().nullable()
        .references('id').inTable('nom_momentums')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.integer('parent_id').unsigned().nullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('NO ACTION').onUpdate('NO ACTION');
      t.integer('paired_account_block_id').unsigned().nullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('NO ACTION').onUpdate('NO ACTION');
      t.integer('token_id').unsigned().nullable()
        .references('id').inTable('nom_tokens')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.integer('contract_method_id').unsigned().nullable()
        .references('id').inTable('nom_contract_methods')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.integer('version').notNullable().defaultTo(1);
      t.integer('block_type').notNullable();
      t.bigInteger('height').notNullable();
      t.string('amount').notNullable().defaultTo('0');
      t.bigInteger('fused_plasma').notNullable().defaultTo(0);
      t.bigInteger('base_plasma').notNullable().defaultTo(0);
      t.bigInteger('used_plasma').notNullable().defaultTo(0);
      t.bigInteger('difficulty').notNullable().defaultTo(0);
      t.text('nonce');
      t.string('hash').notNullable().unique();
      t.timestamp('created_at').notNullable();

      t.index('account_id');
      t.index('to_account_id');
      t.index('momentum_id');
      t.index('momentum_acknowledged_id');
      t.index('parent_id');
      t.index('paired_account_block_id');
      t.index('token_id');
      t.index('contract_method_id');
      t.index('block_type');
      t.index('height');
      t.index('created_at');
      t.index(['account_id', 'to_account_id']);
      t.index(['account_id', 'token_id']);
      t.index(['to_account_id', 'token_id']);
      t.index(['to_account_id', 'token_id', 'amount']);
      t.index(['account_id', 'token_id', 'amount']);
      t.index(['account_id', 'to_account_id', 'token_id']);
    })

    // ─── nom_account_block_data ─────────────────────────────────────
    .createTable('nom_account_block_data', (t) => {
      t.increments('id').primary();
      t.integer('account_block_id').unsigned().notNullable().unique()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.text('raw').notNullable();
      t.text('decoded');
    })

    // ─── nom_pillar_update_histories ────────────────────────────────
    .createTable('nom_pillar_update_histories', (t) => {
      t.increments('id').primary();
      t.integer('pillar_id').unsigned().notNullable()
        .references('id').inTable('nom_pillars')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('producer_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('withdraw_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('momentum_rewards').notNullable().defaultTo(0);
      t.integer('delegate_rewards').notNullable().defaultTo(0);
      t.boolean('is_reward_change').notNullable().defaultTo(false);
      t.timestamp('updated_at').notNullable();

      t.index('pillar_id');
      t.index('producer_account_id');
      t.index('withdraw_account_id');
    })

    // ─── nom_delegations ────────────────────────────────────────────
    .createTable('nom_delegations', (t) => {
      t.increments('id').primary();
      t.integer('pillar_id').unsigned().notNullable()
        .references('id').inTable('nom_pillars')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.timestamp('started_at').notNullable();
      t.timestamp('ended_at');

      t.index('account_id');
      t.index(['pillar_id', 'account_id']);
      t.index('started_at');
      t.index('ended_at');
    })

    // ─── nom_stakes ─────────────────────────────────────────────────
    .createTable('nom_stakes', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('amount').notNullable().defaultTo('0');
      t.bigInteger('duration').notNullable();
      t.timestamp('started_at').notNullable();
      t.timestamp('ended_at');

      t.index('account_id');
      t.index('token_id');
      t.index('account_block_id');
      t.index('amount');
      t.index('duration');
      t.index('started_at');
      t.index('ended_at');
    })

    // ─── nom_plasma ─────────────────────────────────────────────────
    .createTable('nom_plasma', (t) => {
      t.increments('id').primary();
      t.integer('from_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('to_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('amount').notNullable();
      t.timestamp('started_at').notNullable();
      t.timestamp('ended_at');

      t.index('from_account_id');
      t.index('to_account_id');
      t.index('account_block_id');
      t.index('amount');
      t.index('started_at');
      t.index('ended_at');
    })

    // ─── nom_sentinels ──────────────────────────────────────────────
    .createTable('nom_sentinels', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.timestamp('created_at').notNullable();
      t.timestamp('revoked_at');

      t.index('owner_id');
      t.index('created_at');
      t.index('revoked_at');
    })

    // ─── nom_token_mints ────────────────────────────────────────────
    .createTable('nom_token_mints', (t) => {
      t.increments('id').primary();
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('issuer_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('receiver_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('amount').notNullable();
      t.timestamp('created_at').notNullable();

      t.index('token_id');
      t.index('issuer_id');
      t.index('receiver_id');
      t.index('account_block_id');
      t.index('created_at');
    })

    // ─── nom_token_burns ────────────────────────────────────────────
    .createTable('nom_token_burns', (t) => {
      t.increments('id').primary();
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('amount').notNullable();
      t.timestamp('created_at').notNullable();

      t.index('token_id');
      t.index('account_id');
      t.index('account_block_id');
      t.index('created_at');
    })

    // ─── nom_account_tokens ─────────────────────────────────────────
    .createTable('nom_account_tokens', (t) => {
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('balance').notNullable().defaultTo('0');
      t.timestamp('updated_at').notNullable();

      t.primary(['account_id', 'token_id']);
      t.index(['account_id', 'token_id', 'balance']);
      t.index('balance');
      t.index('updated_at');
    })

    // ─── nom_account_rewards ────────────────────────────────────────
    .createTable('nom_account_rewards', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().nullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.string('type').notNullable();
      t.string('amount').notNullable().defaultTo('0');
      t.timestamp('created_at').notNullable();

      t.index('token_id');
      t.index('account_block_id');
      t.index(['account_id', 'type']);
      t.index('type');
      t.index('amount');
      t.index('created_at');
    })

    // ─── nom_accelerator_projects ───────────────────────────────────
    .createTable('nom_accelerator_projects', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('hash').notNullable().unique();
      t.string('name').notNullable();
      t.string('slug').notNullable();
      t.string('url').notNullable();
      t.string('description').notNullable();
      t.integer('status').notNullable().defaultTo(0);
      t.bigInteger('znn_requested').notNullable().defaultTo(0);
      t.bigInteger('qsr_requested').notNullable().defaultTo(0);
      t.bigInteger('znn_paid').notNullable().defaultTo(0);
      t.bigInteger('qsr_paid').notNullable().defaultTo(0);
      t.bigInteger('znn_remaining').notNullable().defaultTo(0);
      t.bigInteger('qsr_remaining').notNullable().defaultTo(0);
      t.decimal('znn_price', 12, 4).nullable();
      t.decimal('qsr_price', 12, 4).nullable();
      t.integer('total_votes').notNullable().defaultTo(0);
      t.integer('total_yes_votes').notNullable().defaultTo(0);
      t.integer('total_no_votes').notNullable().defaultTo(0);
      t.integer('total_abstain_votes').notNullable().defaultTo(0);
      t.timestamp('created_at').notNullable();
      t.timestamp('updated_at');

      t.index('owner_id');
      t.index('name');
      t.index('slug');
      t.index('total_votes');
      t.index('total_yes_votes');
      t.index('total_no_votes');
      t.index('total_abstain_votes');
      t.index('created_at');
      t.index('updated_at');
    })

    // ─── nom_accelerator_phases ─────────────────────────────────────
    .createTable('nom_accelerator_phases', (t) => {
      t.increments('id').primary();
      t.integer('project_id').unsigned().notNullable()
        .references('id').inTable('nom_accelerator_projects')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('hash').notNullable().unique();
      t.string('name').notNullable();
      t.string('slug').notNullable();
      t.string('url').notNullable();
      t.string('description').notNullable();
      t.integer('status').notNullable().defaultTo(0);
      t.integer('phase_number').notNullable().defaultTo(1);
      t.bigInteger('znn_requested').notNullable().defaultTo(0);
      t.bigInteger('qsr_requested').notNullable().defaultTo(0);
      t.decimal('znn_price', 12, 4).nullable();
      t.decimal('qsr_price', 12, 4).nullable();
      t.integer('total_votes').notNullable().defaultTo(0);
      t.integer('total_yes_votes').notNullable().defaultTo(0);
      t.integer('total_no_votes').notNullable().defaultTo(0);
      t.integer('total_abstain_votes').notNullable().defaultTo(0);
      t.timestamp('accepted_at');
      t.timestamp('created_at').notNullable();
      t.timestamp('updated_at');

      t.index('project_id');
      t.index('name');
      t.index('slug');
      t.index('total_votes');
      t.index('total_yes_votes');
      t.index('total_no_votes');
      t.index('total_abstain_votes');
      t.index('created_at');
      t.index('updated_at');
    })

    // ─── nom_bridge_admins ──────────────────────────────────────────
    .createTable('nom_bridge_admins', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('nominated_by_id').unsigned().nullable()
        .references('id').inTable('nom_accounts')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.timestamp('nominated_at');
      t.timestamp('accepted_at');
      t.timestamp('revoked_at');

      t.index('account_id');
      t.index('nominated_by_id');
    })

    // ─── nom_bridge_guardians ───────────────────────────────────────
    .createTable('nom_bridge_guardians', (t) => {
      t.increments('id').primary();
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.timestamp('nominated_at').notNullable();
      t.timestamp('accepted_at');
      t.timestamp('revoked_at');

      t.index('account_id');
    })

    // ─── nom_bridge_networks ────────────────────────────────────────
    .createTable('nom_bridge_networks', (t) => {
      t.increments('id').primary();
      t.bigInteger('chain_identifier').notNullable();
      t.bigInteger('network_class').notNullable();
      t.string('name').notNullable();
      t.string('contract_address').notNullable();
      t.string('explorer_url');
      t.string('explorer_tx_link');
      t.string('explorer_address_link');
      t.string('explorer_api_url');
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
    })

    // ─── nom_bridge_network_tokens ──────────────────────────────────
    .createTable('nom_bridge_network_tokens', (t) => {
      t.increments('id').primary();
      t.integer('bridge_network_id').unsigned().notNullable()
        .references('id').inTable('nom_bridge_networks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('token_address').notNullable();
      t.string('min_amount').notNullable();
      t.integer('fee_percentage').notNullable();
      t.integer('redeem_delay').notNullable();
      t.text('metadata');
      t.boolean('is_bridgeable').notNullable().defaultTo(false);
      t.boolean('is_redeemable').notNullable().defaultTo(false);
      t.boolean('is_owned').notNullable().defaultTo(false);
      t.timestamp('created_at');
      t.timestamp('updated_at');

      t.index('bridge_network_id');
      t.index('token_id');
      t.unique(['bridge_network_id', 'token_id']);
    })

    // ─── nom_bridge_wraps ───────────────────────────────────────────
    .createTable('nom_bridge_wraps', (t) => {
      t.increments('id').primary();
      t.integer('bridge_network_id').unsigned().notNullable()
        .references('id').inTable('nom_bridge_networks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.string('to_address').notNullable();
      t.text('signature');
      t.string('amount').notNullable().defaultTo('0');
      t.timestamp('created_at');
      t.timestamp('updated_at');

      t.index('bridge_network_id');
      t.index('account_id');
      t.index('token_id');
      t.index('account_block_id');
    })

    // ─── nom_bridge_unwraps ─────────────────────────────────────────
    .createTable('nom_bridge_unwraps', (t) => {
      t.increments('id').primary();
      t.integer('bridge_network_id').unsigned().notNullable()
        .references('id').inTable('nom_bridge_networks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('to_account_id').unsigned().notNullable()
        .references('id').inTable('nom_accounts')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('token_id').unsigned().notNullable()
        .references('id').inTable('nom_tokens')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.integer('account_block_id').unsigned().notNullable()
        .references('id').inTable('nom_account_blocks')
        .onDelete('RESTRICT').onUpdate('CASCADE');
      t.bigInteger('log_index').notNullable();
      t.string('from_address');
      t.string('transaction_hash').notNullable();
      t.text('signature');
      t.string('amount').notNullable();
      t.timestamp('redeemed_at');
      t.timestamp('revoked_at');
      t.timestamp('created_at');
      t.timestamp('updated_at');

      t.index('bridge_network_id');
      t.index('to_account_id');
      t.index('token_id');
      t.index('account_block_id');
    })

    // ─── nom_votes ──────────────────────────────────────────────────
    .createTable('nom_votes', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().nullable()
        .references('id').inTable('nom_accounts')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.integer('pillar_id').unsigned().nullable()
        .references('id').inTable('nom_pillars')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.string('votable_type').notNullable();
      t.integer('votable_id').notNullable();
      t.integer('vote').notNullable().defaultTo(0);
      t.timestamp('created_at');

      t.index('owner_id');
      t.index('pillar_id');
      t.index(['votable_type', 'votable_id']);
      t.index('vote');
      t.index('created_at');
    })

    // ─── nom_time_challenges ────────────────────────────────────────
    .createTable('nom_time_challenges', (t) => {
      t.increments('id').primary();
      t.integer('contract_method_id').unsigned().nullable()
        .references('id').inTable('nom_contract_methods')
        .onDelete('SET NULL').onUpdate('CASCADE');
      t.string('hash').notNullable().defaultTo('0');
      t.bigInteger('delay').notNullable().defaultTo(0);
      t.bigInteger('start_height');
      t.bigInteger('end_height');
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('expires_at');
      t.timestamp('created_at');

      t.index('contract_method_id');
      t.index('expires_at');
      t.index('created_at');
    })

    // ─── indexer_state ──────────────────────────────────────────────
    .createTable('indexer_state', (t) => {
      t.increments('id').primary();
      t.bigInteger('last_indexed_momentum').notNullable().defaultTo(0);
      t.boolean('is_running').notNullable().defaultTo(false);
      t.timestamp('updated_at').notNullable();
    })

    // ─── indexer_plugin_state ──────────────────────────────────────────
    .createTable('indexer_plugin_state', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable().unique();
      t.bigInteger('watermark').notNullable().defaultTo(0);
      t.timestamp('updated_at').notNullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('indexer_plugin_state')
    .dropTableIfExists('indexer_state')
    .dropTableIfExists('nom_time_challenges')
    .dropTableIfExists('nom_votes')
    .dropTableIfExists('nom_bridge_unwraps')
    .dropTableIfExists('nom_bridge_wraps')
    .dropTableIfExists('nom_bridge_network_tokens')
    .dropTableIfExists('nom_bridge_networks')
    .dropTableIfExists('nom_bridge_guardians')
    .dropTableIfExists('nom_bridge_admins')
    .dropTableIfExists('nom_accelerator_phases')
    .dropTableIfExists('nom_accelerator_projects')
    .dropTableIfExists('nom_account_rewards')
    .dropTableIfExists('nom_account_tokens')
    .dropTableIfExists('nom_token_burns')
    .dropTableIfExists('nom_token_mints')
    .dropTableIfExists('nom_sentinels')
    .dropTableIfExists('nom_plasma')
    .dropTableIfExists('nom_stakes')
    .dropTableIfExists('nom_delegations')
    .dropTableIfExists('nom_pillar_update_histories')
    .dropTableIfExists('nom_account_block_data')
    .dropTableIfExists('nom_account_blocks')
    .dropTableIfExists('nom_momentums')
    .dropTableIfExists('nom_contract_methods')
    .dropTableIfExists('nom_contracts')
    .dropTableIfExists('nom_pillars')
    .dropTableIfExists('nom_tokens')
    .dropTableIfExists('nom_accounts');
};
