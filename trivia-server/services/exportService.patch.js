// Temporary compatibility layer for exports table
// This handles both old (export_type) and new (type) column names

const getExportTypeColumn = async (db) => {
  const hasType = await db.schema.hasColumn('exports', 'type');
  return hasType ? 'type' : 'export_type';
};

const getFileColumn = async (db) => {
  const hasFileUrl = await db.schema.hasColumn('exports', 'file_url');
  return hasFileUrl ? 'file_url' : 'file_path';
};

module.exports = { getExportTypeColumn, getFileColumn };
