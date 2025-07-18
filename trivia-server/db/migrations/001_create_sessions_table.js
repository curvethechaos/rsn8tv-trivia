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
