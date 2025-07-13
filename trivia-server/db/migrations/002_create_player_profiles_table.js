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
