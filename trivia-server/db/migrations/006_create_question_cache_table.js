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
