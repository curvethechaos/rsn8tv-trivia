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
