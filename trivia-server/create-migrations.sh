#!/bin/bash

mkdir -p db/migrations

# Migration 1: Sessions
cat > db/migrations/001_create_sessions_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('sessions', table => {
    table.string('id').primary();
    table.string('host_id').notNullable();
    table.string('room_code', 4).unique().notNullable();
    table.text('qr_code_data').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('total_rounds').defaultTo(3);
    table.integer('current_round').defaultTo(1);
    table.integer('current_question').defaultTo(0);
    table.enum('questions_source', ['trivia_api', 'cache', 'fallback']).defaultTo('trivia_api');
    table.jsonb('question_set').notNullable();
    table.boolean('round_1_complete').defaultTo(false);
    table.boolean('round_2_complete').defaultTo(false);
    table.boolean('round_3_complete').defaultTo(false);
    table.boolean('offline_mode').defaultTo(false);
    table.string('device_group');
    table.jsonb('branding_assets');
    table.string('aws_region').defaultTo('us-east-1');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.index('room_code');
    table.index('is_active');
    table.index('created_at');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('sessions');
};
EOF

# Migration 2: Player Profiles
cat > db/migrations/002_create_player_profiles_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('player_profiles', table => {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('nickname').notNullable();
    table.boolean('nickname_approved').defaultTo(true);
    table.boolean('marketing_consent').defaultTo(false);
    table.timestamp('marketing_consent_timestamp');
    table.string('device_fingerprint');
    table.boolean('email_verified').defaultTo(false);
    table.integer('total_games_played').defaultTo(0);
    table.integer('total_score').defaultTo(0);
    table.timestamp('last_played');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('email');
    table.index('device_fingerprint');
    table.index('last_played');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('player_profiles');
};
EOF

# Migration 3: Players
cat > db/migrations/003_create_players_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('players', table => {
    table.increments('id').primary();
    table.string('session_id').notNullable();
    table.integer('player_profile_id').unsigned();
    table.string('temporary_name').notNullable();
    table.string('client_id').notNullable();
    table.integer('score').defaultTo(0);
    table.boolean('is_registered').defaultTo(false);
    table.boolean('registration_prompted').defaultTo(false);
    table.timestamp('qr_scan_timestamp').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.foreign('session_id').references('id').inTable('sessions').onDelete('CASCADE');
    table.foreign('player_profile_id').references('id').inTable('player_profiles');
    table.unique(['session_id', 'client_id']);
    table.index('session_id');
    table.index('player_profile_id');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('players');
};
EOF

# Migration 4: Answers
cat > db/migrations/004_create_answers_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('answers', table => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable();
    table.string('session_id').notNullable();
    table.integer('question_index').notNullable();
    table.integer('answer_index').notNullable();
    table.boolean('is_correct').notNullable();
    table.integer('response_time_ms').notNullable();
    table.integer('base_points').notNullable();
    table.integer('time_bonus').defaultTo(0);
    table.integer('penalty_points').defaultTo(0);
    table.integer('streak_bonus').defaultTo(0);
    table.integer('final_score').notNullable();
    table.decimal('speed_percentage', 5, 2);
    table.integer('streak_count').defaultTo(0);
    table.integer('time_remaining_ms');
    table.integer('answer_speed_rank');
    table.boolean('is_perfect_round').defaultTo(false);
    table.integer('round_bonus').defaultTo(0);
    table.timestamp('answered_at').defaultTo(knex.fn.now());
    table.foreign('player_id').references('id').inTable('players').onDelete('CASCADE');
    table.foreign('session_id').references('id').inTable('sessions').onDelete('CASCADE');
    table.unique(['player_id', 'session_id', 'question_index']);
    table.index(['session_id', 'question_index']);
    table.index('player_id');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('answers');
};
EOF

# Migration 5: Leaderboards
cat > db/migrations/005_create_leaderboards_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('leaderboards', table => {
    table.increments('id').primary();
    table.integer('player_profile_id').unsigned().notNullable();
    table.enum('period_type', ['weekly', 'monthly', 'quarterly', 'yearly']).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.integer('total_score').defaultTo(0);
    table.integer('games_played').defaultTo(0);
    table.decimal('average_score', 10, 2);
    table.integer('rank_position');
    table.string('aws_region').defaultTo('us-east-1');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.foreign('player_profile_id').references('id').inTable('player_profiles').onDelete('CASCADE');
    table.unique(['player_profile_id', 'period_type', 'period_start']);
    table.index(['period_type', 'period_start', 'rank_position']);
    table.index(['player_profile_id', 'period_type']);
    table.index('aws_region');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('leaderboards');
};
EOF

# Migration 6: Question Cache
cat > db/migrations/006_create_question_cache_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('question_cache', table => {
    table.increments('id').primary();
    table.string('api_question_id').unique().notNullable();
    table.text('question_text').notNullable();
    table.string('correct_answer', 500).notNullable();
    table.jsonb('incorrect_answers').notNullable();
    table.string('category', 100).notNullable();
    table.enum('difficulty', ['easy', 'medium', 'hard']).notNullable();
    table.jsonb('tags');
    table.jsonb('regions');
    table.timestamp('cached_at').defaultTo(knex.fn.now());
    table.timestamp('last_used');
    table.integer('usage_count').defaultTo(0);
    table.index(['category', 'difficulty']);
    table.index(['usage_count', 'last_used']);
    table.index('cached_at');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('question_cache');
};
EOF

# Migration 7: Game Rounds
cat > db/migrations/007_create_game_rounds_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('game_rounds', table => {
    table.increments('id').primary();
    table.string('session_id').notNullable();
    table.integer('round_number').notNullable();
    table.jsonb('questions').notNullable();
    table.timestamp('round_started_at');
    table.timestamp('round_completed_at');
    table.integer('average_response_time');
    table.integer('total_correct_answers').defaultTo(0);
    table.foreign('session_id').references('id').inTable('sessions').onDelete('CASCADE');
    table.unique(['session_id', 'round_number']);
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('game_rounds');
};
EOF

# Migration 8: Player Statistics
cat > db/migrations/008_create_player_statistics_table.js << 'EOF'
exports.up = function(knex) {
  return knex.schema.createTable('player_statistics', table => {
    table.increments('id').primary();
    table.integer('player_profile_id').unsigned();
    table.string('session_id').notNullable();
    table.integer('round_1_score').defaultTo(0);
    table.integer('round_1_correct').defaultTo(0);
    table.boolean('round_1_perfect').defaultTo(false);
    table.integer('round_2_score').defaultTo(0);
    table.integer('round_2_correct').defaultTo(0);
    table.boolean('round_2_perfect').defaultTo(false);
    table.integer('round_3_score').defaultTo(0);
    table.integer('round_3_correct').defaultTo(0);
    table.boolean('round_3_perfect').defaultTo(false);
    table.integer('total_score').defaultTo(0);
    table.integer('total_correct').defaultTo(0);
    table.integer('total_wrong').defaultTo(0);
    table.integer('longest_streak').defaultTo(0);
    table.integer('average_response_time');
    table.integer('fastest_answer_time');
    table.integer('total_time_bonuses').defaultTo(0);
    table.integer('total_penalties').defaultTo(0);
    table.integer('speed_rank');
    table.integer('accuracy_rank');
    table.integer('final_rank');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.foreign('player_profile_id').references('id').inTable('player_profiles');
    table.foreign('session_id').references('id').inTable('sessions').onDelete('CASCADE');
    table.index('session_id');
    table.index('player_profile_id');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('player_statistics');
};
EOF

echo "✅ All migration files created!"
