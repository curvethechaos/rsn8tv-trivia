exports.up = function(knex) {
  return knex.schema
    // Admin users table
    .createTable('admin_users', function(table) {
      table.increments('id').primary();
      table.string('username', 50).unique().notNullable();
      table.string('email', 255).unique().notNullable();
      table.string('password_hash', 255).notNullable();
      table.string('role', 50).defaultTo('admin');
      table.boolean('is_active').defaultTo(true);
      table.boolean('mfa_enabled').defaultTo(false);
      table.string('mfa_secret', 255);
      table.integer('failed_login_attempts').defaultTo(0);
      table.timestamp('locked_until');
      table.timestamp('last_login_at');
      table.specificType('last_login_ip', 'inet');
      table.timestamp('password_changed_at').defaultTo(knex.fn.now());
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // Refresh tokens table
    .createTable('admin_refresh_tokens', function(table) {
      table.increments('id').primary();
      table.integer('admin_user_id').references('id').inTable('admin_users').onDelete('CASCADE');
      table.string('token_hash', 255).unique().notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.specificType('created_ip', 'inet');
      table.timestamp('revoked_at');
      table.string('revoked_reason', 255);
      table.string('replaced_by_token', 255);
      
      table.index('admin_user_id');
      table.index('expires_at');
    })
    // Audit log table
    .createTable('admin_audit_logs', function(table) {
      table.increments('id').primary();
      table.integer('admin_user_id').references('id').inTable('admin_users');
      table.string('action', 100).notNullable();
      table.string('resource_type', 50);
      table.string('resource_id', 255);
      table.specificType('ip_address', 'inet');
      table.text('user_agent');
      table.jsonb('request_data');
      table.integer('response_status');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index('admin_user_id');
      table.index('created_at');
    })
    // Login attempts table
    .createTable('admin_login_attempts', function(table) {
      table.increments('id').primary();
      table.string('username', 255);
      table.specificType('ip_address', 'inet').notNullable();
      table.text('user_agent');
      table.boolean('success').notNullable();
      table.string('failure_reason', 255);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index(['ip_address', 'created_at']);
      table.index('username');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('admin_login_attempts')
    .dropTableIfExists('admin_audit_logs')
    .dropTableIfExists('admin_refresh_tokens')
    .dropTableIfExists('admin_users');
};
