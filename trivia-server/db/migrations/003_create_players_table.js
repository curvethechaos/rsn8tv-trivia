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
