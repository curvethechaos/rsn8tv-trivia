exports.up = async function(knex) {
  // Check if table exists
  const exists = await knex.schema.hasTable('exports');
  
  if (!exists) {
    // Create table if it doesn't exist
    return knex.schema.createTable('exports', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.integer('user_id').unsigned().references('id').inTable('admin_users').onDelete('SET NULL');
      table.enum('type', [
        'players',
        'leaderboards', 
        'questions',
        'marketing_list',
        'prize_winners'
      ]).notNullable();
      table.enum('status', [
        'pending',
        'processing', 
        'completed',
        'failed'
      ]).defaultTo('pending');
      table.jsonb('filters').defaultTo('{}');
      table.text('file_url');
      table.bigInteger('file_size');
      table.integer('row_count');
      table.text('error_message');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');
      
      // Indexes
      table.index(['user_id', 'created_at']);
      table.index(['type', 'status']);
      table.index('created_at');
    });
  } else {
    // Table exists, so ALTER it
    return knex.schema.alterTable('exports', async (table) => {
      // Check and rename export_type to type
      const hasExportType = await knex.schema.hasColumn('exports', 'export_type');
      const hasType = await knex.schema.hasColumn('exports', 'type');
      
      if (hasExportType && !hasType) {
        await knex.raw('ALTER TABLE exports RENAME COLUMN export_type TO type');
      }
      
      // Add missing columns
      const hasFileUrl = await knex.schema.hasColumn('exports', 'file_url');
      if (!hasFileUrl) {
        table.text('file_url');
      }
      
      const hasUpdatedAt = await knex.schema.hasColumn('exports', 'updated_at');
      if (!hasUpdatedAt) {
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      }
      
      // Add foreign key if not exists
      const constraints = await knex.raw(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'exports' 
        AND constraint_type = 'FOREIGN KEY'
      `);
      
      if (!constraints.rows.some(c => c.constraint_name.includes('user_id'))) {
        table.foreign('user_id').references('id').inTable('admin_users').onDelete('SET NULL');
      }
      
      // Drop export_format if it exists
      const hasExportFormat = await knex.schema.hasColumn('exports', 'export_format');
      if (hasExportFormat) {
        table.dropColumn('export_format');
      }
    });
  }
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('exports');
};
