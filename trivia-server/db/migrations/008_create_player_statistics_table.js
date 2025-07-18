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
