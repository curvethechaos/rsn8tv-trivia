const exportService = require('../../services/exportService');
const db = require('../../db/connection');

describe('ExportService', () => {
  beforeEach(async () => {
    await db('exports').truncate();
  });

  it('should create export with correct S3 path', async () => {
    const exportId = await exportService.createExport('players', { venue: 1 }, 1);
    const exportRecord = await db('exports').where({ id: exportId }).first();
    
    expect(exportRecord).toBeDefined();
    expect(exportRecord.export_type).toBe('players');
    expect(exportRecord.status).toBe('pending');
  });

  it('should generate correct S3 key format', () => {
    const key = exportService.generateS3Key('players', 'csv');
    expect(key).toMatch(/^exports\/players\/\d{4}-\d{2}-\d{2}\/[\w-]+\.csv$/);
  });
});
