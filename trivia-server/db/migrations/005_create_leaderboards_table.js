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
