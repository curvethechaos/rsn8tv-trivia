exports.up = function(knex) {
  return knex.schema
    // Create exports table
    .createTable('exports', table => {
      table.uuid('id').primary();
      table.string('type').notNullable();
      table.jsonb('filters');
      table.enum('status', ['pending', 'processing', 'completed', 'failed']).defaultTo('pending');
      table.string('filename');
      table.string('s3_key');
      table.integer('file_size');
      table.text('error_message');
      table.integer('created_by').unsigned();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.timestamp('failed_at');
      table.foreign('created_by').references('id').inTable('admin_users');
      table.index(['created_by', 'created_at']);
      table.index('status');
    })
    // Create themes table
    .createTable('themes', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.jsonb('colors').notNullable();
      table.jsonb('fonts');
      table.jsonb('animations');
      table.boolean('is_active').defaultTo(false);
      table.integer('created_by').unsigned();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.foreign('created_by').references('id').inTable('admin_users');
      table.index('is_active');
    })
    // Create branding_config table
    .createTable('branding_config', table => {
      table.increments('id').primary();
      table.string('main_logo_url');
      table.string('favicon_url');
      table.jsonb('sponsor_logos');
      table.string('company_name').defaultTo('RSN8TV Trivia');
      table.string('tagline').defaultTo('Real-time multiplayer trivia');
      table.text('footer_text').defaultTo('© 2025 RSN8TV. All rights reserved.');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index('is_active');
    })
    // Create prize_configurations table
    .createTable('prize_configurations', table => {
      table.increments('id').primary();
      table.enum('type', ['time-based', 'threshold']).notNullable();
      table.enum('period', ['weekly', 'monthly', 'quarterly', 'yearly']).notNullable();
      table.integer('period_order');
      table.text('description');
      table.string('prize_value');
      table.integer('min_score');
      table.boolean('enabled').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['type', 'period']);
      table.index('enabled');
    })
    // Create prize_claims table
    .createTable('prize_claims', table => {
      table.increments('id').primary();
      table.integer('player_profile_id').unsigned().notNullable();
      table.enum('prize_type', ['time-based', 'threshold']).notNullable();
      table.enum('period_type', ['weekly', 'monthly', 'quarterly', 'yearly']).notNullable();
      table.date('period_start').notNullable();
      table.timestamp('claimed_at').defaultTo(knex.fn.now());
      table.foreign('player_profile_id').references('id').inTable('player_profiles');
      table.unique(['player_profile_id', 'prize_type', 'period_type', 'period_start']);
      table.index(['period_type', 'period_start']);
    })
    // Add columns to questions table if it exists
    .then(() => {
      return knex.schema.hasTable('questions').then(exists => {
        if (!exists) {
          return knex.schema.createTable('questions', table => {
            table.increments('id').primary();
            table.text('question').notNullable();
            table.string('correct_answer').notNullable();
            table.jsonb('incorrect_answers').notNullable();
            table.string('category').notNullable();
            table.enum('difficulty', ['easy', 'medium', 'hard']).notNullable();
            table.boolean('is_flagged').defaultTo(false);
            table.boolean('is_custom').defaultTo(false);
            table.integer('flagged_by').unsigned();
            table.timestamp('flagged_at');
            table.integer('updated_by').unsigned();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            table.index(['category', 'difficulty']);
            table.index('is_flagged');
            table.index('is_custom');
          });
        } else {
          return knex.schema.alterTable('questions', table => {
            table.boolean('is_flagged').defaultTo(false);
            table.boolean('is_custom').defaultTo(false);
            table.integer('flagged_by').unsigned();
            table.timestamp('flagged_at');
            table.integer('updated_by').unsigned();
          });
        }
      });
    })
    // Create question_responses table for statistics
    .createTable('question_responses', table => {
      table.increments('id').primary();
      table.integer('question_id').unsigned().notNullable();
      table.integer('player_id').unsigned().notNullable();
      table.string('session_id').notNullable();
      table.boolean('is_correct').notNullable();
      table.integer('response_time'); // in milliseconds
      table.timestamp('answered_at').defaultTo(knex.fn.now());
      table.foreign('question_id').references('id').inTable('questions');
      table.foreign('player_id').references('id').inTable('players');
      table.foreign('session_id').references('id').inTable('sessions');
      table.index(['question_id', 'is_correct']);
      table.index('session_id');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('question_responses')
    .dropTableIfExists('prize_claims')
    .dropTableIfExists('prize_configurations')
    .dropTableIfExists('branding_config')
    .dropTableIfExists('themes')
    .dropTableIfExists('exports');
};
