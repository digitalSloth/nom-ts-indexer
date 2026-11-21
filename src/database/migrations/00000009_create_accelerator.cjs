exports.up = async function (knex) {
  await knex.schema.createTable('nom_accelerator_projects', (t) => {
    t.increments('id').primary();
    t.integer('owner_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('status').notNullable().defaultTo(0);
    t.bigInteger('znn_requested').notNullable().defaultTo(0);
    t.bigInteger('qsr_requested').notNullable().defaultTo(0);
    t.bigInteger('znn_paid').notNullable().defaultTo(0);
    t.bigInteger('qsr_paid').notNullable().defaultTo(0);
    t.bigInteger('znn_remaining').notNullable().defaultTo(0);
    t.bigInteger('qsr_remaining').notNullable().defaultTo(0);
    t.integer('total_votes').notNullable().defaultTo(0);
    t.integer('total_yes_votes').notNullable().defaultTo(0);
    t.integer('total_no_votes').notNullable().defaultTo(0);
    t.integer('total_abstain_votes').notNullable().defaultTo(0);
    t.string('hash').notNullable().unique();
    t.string('name').notNullable();
    t.string('slug').notNullable();
    t.string('url').notNullable();
    t.string('description').notNullable();
    t.timestamp('created_at').notNullable();
    t.timestamp('updated_at');
    t.timestamp('accepted_at').nullable();

    t.index('owner_id');
    t.index('name');
    t.index('slug');
    t.index('total_votes');
    t.index('total_yes_votes');
    t.index('total_no_votes');
    t.index('total_abstain_votes');
    t.index('created_at');
    t.index('updated_at');
  });

  await knex.schema.createTable('nom_accelerator_phases', (t) => {
    t.increments('id').primary();
    t.integer('project_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('nom_accelerator_projects')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    t.integer('status').notNullable().defaultTo(0);
    t.integer('phase_number').notNullable().defaultTo(1);
    t.bigInteger('znn_requested').notNullable().defaultTo(0);
    t.bigInteger('qsr_requested').notNullable().defaultTo(0);
    t.integer('total_votes').notNullable().defaultTo(0);
    t.integer('total_yes_votes').notNullable().defaultTo(0);
    t.integer('total_no_votes').notNullable().defaultTo(0);
    t.integer('total_abstain_votes').notNullable().defaultTo(0);
    t.string('hash').notNullable().unique();
    t.string('name').notNullable();
    t.string('slug').notNullable();
    t.string('url').notNullable();
    t.string('description').notNullable();
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
  });

  await knex.schema.createTable('nom_votes', (t) => {
    t.increments('id').primary();
    t.integer('votable_id').notNullable();
    t.integer('owner_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_accounts')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('pillar_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('nom_pillars')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    t.integer('vote').notNullable().defaultTo(0);
    t.string('votable_type').notNullable();
    t.timestamp('created_at');

    t.index('pillar_id');
    t.index(['votable_type', 'votable_id']);
    t.index('vote');
    t.index('created_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('nom_votes');
  await knex.schema.dropTableIfExists('nom_accelerator_phases');
  await knex.schema.dropTableIfExists('nom_accelerator_projects');
};
