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
