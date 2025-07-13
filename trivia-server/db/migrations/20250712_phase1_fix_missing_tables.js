// Migration to fix missing Phase 1 tables and correct existing ones
exports.up = async function(knex) {
  // Fix exports table - add missing columns
  await knex.schema.alterTable('exports', table => {
    // Check and add columns only if they don't exist
    knex.schema.hasColumn('exports', 'type').then(exists => {
      if (!exists) table.string('type').nullable();
    });
    knex.schema.hasColumn('exports', 'filename').then(exists => {
      if (!exists) table.string('filename').nullable();
    });
    knex.schema.hasColumn('exports', 's3_key').then(exists => {
      if (!exists) table.string('s3_key').nullable();
    });
    knex.schema.hasColumn('exports', 'started_at').then(exists => {
      if (!exists) table.timestamp('started_at').nullable();
    });
    knex.schema.hasColumn('exports', 'failed_at').then(exists => {
      if (!exists) table.timestamp('failed_at').nullable();
    });
  });
  
  // Fix themes table - add missing JSONB columns
  await knex.schema.alterTable('themes', table => {
    knex.schema.hasColumn('themes', 'colors').then(exists => {
      if (!exists) table.jsonb('colors').nullable();
    });
    knex.schema.hasColumn('themes', 'fonts').then(exists => {
      if (!exists) table.jsonb('fonts').nullable();
    });
    knex.schema.hasColumn('themes', 'animations').then(exists => {
      if (!exists) table.jsonb('animations').nullable();
    });
    knex.schema.hasColumn('themes', 'created_by').then(exists => {
      if (!exists) {
        table.integer('created_by').unsigned().nullable();
        table.foreign('created_by').references('id').inTable('admin_users');
      }
    });
  });
  
  // Create missing branding_config table
  const brandingExists = await knex.schema.hasTable('branding_config');
  if (!brandingExists) {
    await knex.schema.createTable('branding_config', table => {
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
    });
  }
  
  // Create missing prize_configurations table
  const prizeConfigExists = await knex.schema.hasTable('prize_configurations');
  if (!prizeConfigExists) {
    await knex.schema.createTable('prize_configurations', table => {
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
    });
    
    // Insert default prize configurations
    await knex('prize_configurations').insert([
      // Time-based prizes (no minimums)
      { type: 'time-based', period: 'weekly', period_order: 1, description: 'Weekly high score winner', prize_value: '$25 Gift Card', min_score: null, enabled: true },
      { type: 'time-based', period: 'monthly', period_order: 2, description: 'Monthly high score winner', prize_value: '$50 Gift Card', min_score: null, enabled: true },
      { type: 'time-based', period: 'quarterly', period_order: 3, description: 'Quarterly high score winner', prize_value: '$100 Gift Card', min_score: null, enabled: true },
      { type: 'time-based', period: 'yearly', period_order: 4, description: 'Yearly high score winner', prize_value: '$500 Grand Prize', min_score: null, enabled: true },
      // Threshold prize
      { type: 'threshold', period: 'weekly', period_order: 1, description: 'Weekly achievement prize', prize_value: 'Sponsor Coupons', min_score: 8500, enabled: true }
    ]);
  }
  
  // Create missing prize_claims table
  const prizeClaimsExists = await knex.schema.hasTable('prize_claims');
  if (!prizeClaimsExists) {
    await knex.schema.createTable('prize_claims', table => {
      table.increments('id').primary();
      table.integer('player_profile_id').unsigned().notNullable();
      table.enum('prize_type', ['time-based', 'threshold']).notNullable();
      table.enum('period_type', ['weekly', 'monthly', 'quarterly', 'yearly']).notNullable();
      table.date('period_start').notNullable();
      table.timestamp('claimed_at').defaultTo(knex.fn.now());
      table.foreign('player_profile_id').references('id').inTable('player_profiles');
      table.unique(['player_profile_id', 'prize_type', 'period_type', 'period_start']);
      table.index(['period_type', 'period_start']);
    });
  }
  
  // Check if questions table exists and add missing columns
  const questionsExists = await knex.schema.hasTable('questions');
  if (questionsExists) {
    const hasFlag = await knex.schema.hasColumn('questions', 'is_flagged');
    if (!hasFlag) {
      await knex.schema.alterTable('questions', table => {
        table.boolean('is_flagged').defaultTo(false);
        table.boolean('is_custom').defaultTo(false);
        table.integer('flagged_by').unsigned();
        table.timestamp('flagged_at');
        table.integer('updated_by').unsigned();
      });
    }
  } else {
    // Create questions table if it doesn't exist
    await knex.schema.createTable('questions', table => {
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
  }
  
  // Create missing question_responses table
  const questionResponsesExists = await knex.schema.hasTable('question_responses');
  if (!questionResponsesExists) {
    await knex.schema.createTable('question_responses', table => {
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
  }
  
  // Create system_settings table (missing from Phase 1)
  const systemSettingsExists = await knex.schema.hasTable('system_settings');
  if (!systemSettingsExists) {
    await knex.schema.createTable('system_settings', table => {
      table.string('key').primary();
      table.jsonb('value').notNullable();
      table.text('description');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
  
  // Create venues table (missing from Phase 1)
  const venuesExists = await knex.schema.hasTable('venues');
  if (!venuesExists) {
    await knex.schema.createTable('venues', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.text('address');
      table.jsonb('contact_info');
      table.string('xibo_display_id');
      table.jsonb('settings');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index('is_active');
      table.index('xibo_display_id');
    });
  }
  
  // Create email_campaigns table (missing from Phase 1)
  const emailCampaignsExists = await knex.schema.hasTable('email_campaigns');
  if (!emailCampaignsExists) {
    await knex.schema.createTable('email_campaigns', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('subject').notNullable();
      table.text('content').notNullable();
      table.jsonb('target_audience');
      table.enum('status', ['draft', 'scheduled', 'sending', 'sent', 'failed']).defaultTo('draft');
      table.integer('sent_count').defaultTo(0);
      table.integer('open_count').defaultTo(0);
      table.integer('click_count').defaultTo(0);
      table.integer('created_by').unsigned();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('scheduled_at');
      table.timestamp('sent_at');
      table.foreign('created_by').references('id').inTable('admin_users');
      table.index(['status', 'scheduled_at']);
    });
  }
};

exports.down = async function(knex) {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('email_campaigns');
  await knex.schema.dropTableIfExists('venues');
  await knex.schema.dropTableIfExists('system_settings');
  await knex.schema.dropTableIfExists('question_responses');
  await knex.schema.dropTableIfExists('prize_claims');
  await knex.schema.dropTableIfExists('prize_configurations');
  await knex.schema.dropTableIfExists('branding_config');
  
  // Note: We don't revert column changes in themes and exports tables
  // as that could cause data loss
};
