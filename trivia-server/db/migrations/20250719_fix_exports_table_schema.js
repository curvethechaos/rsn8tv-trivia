exports.up = async function(knex) {
  // First, check what columns exist
  const hasExportType = await knex.schema.hasColumn('exports', 'export_type');
  const hasType = await knex.schema.hasColumn('exports', 'type');
  const hasUserId = await knex.schema.hasColumn('exports', 'user_id');
  const hasFileUrl = await knex.schema.hasColumn('exports', 'file_url');
  const hasUpdatedAt = await knex.schema.hasColumn('exports', 'updated_at');
  
  return knex.schema.alterTable('exports', table => {
    // Rename export_type to type if needed
    if (hasExportType && !hasType) {
      table.renameColumn('export_type', 'type');
    }
    
    // Add file_url if it doesn't exist (replacing file_path)
    if (!hasFileUrl) {
      table.text('file_url');
    }
    
    // Add updated_at if it doesn't exist
    if (!hasUpdatedAt) {
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    }
    
    // Update user_id to reference admin_users if not already
    if (hasUserId) {
      // Add foreign key constraint if not exists
      table.foreign('user_id').references('id').inTable('admin_users').onDelete('SET NULL');
    }
    
    // Drop export_format if it exists (we'll use CSV for everything)
    if (knex.schema.hasColumn('exports', 'export_format')) {
      table.dropColumn('export_format');
    }
    
    // Add missing indexes
    table.index(['user_id', 'created_at']);
    table.index(['type', 'status']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('exports', table => {
    // Revert changes
    table.renameColumn('type', 'export_type');
    table.dropColumn('file_url');
    table.dropColumn('updated_at');
    table.string('export_format', 20).defaultTo('csv');
    
    // Drop indexes
    table.dropIndex(['user_id', 'created_at']);
    table.dropIndex(['type', 'status']);
  });
};
