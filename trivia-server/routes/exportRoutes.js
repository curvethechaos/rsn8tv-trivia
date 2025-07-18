// routes/exportRoutes.js - Export management routes
const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

// POST /api/admin/exports
router.post('/', [
  body('type').isIn(['players', 'leaderboard', 'questions', 'prizes', 'analytics']),
  body('filters').optional().isObject()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const exportService = req.app.locals.exportService;
    const { type, filters = {} } = req.body;

    let exportId;
    
    // Try service first
    if (exportService && exportService.createExport) {
      exportId = await exportService.createExport(type, filters, req.user.id);
    } else {
      // Fallback to basic implementation
      exportId = uuidv4();
      
      // Store export request in database
      await db('exports').insert({
        id: exportId,
        user_id: req.user.id,
        export_type: type,
        filters: JSON.stringify(filters),
        status: 'pending',
        created_at: new Date()
      });

      // Trigger export processing (simplified)
      process.nextTick(() => processExport(exportId, type, filters, db));
    }

    res.json({
      success: true,
      data: { exportId }
    });
  } catch (error) {
    console.error('Error creating export:', error);
    next(error);
  }
});

// GET /api/admin/exports
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const exportService = req.app.locals.exportService;
    const { page = 1, limit = 20 } = req.query;

    let exports;
    
    // Try service first
    if (exportService && exportService.listExports) {
      exports = await exportService.listExports(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
    } else {
      // Fallback to direct database query
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const [data, countResult] = await Promise.all([
        db('exports')
          .where('user_id', req.user.id)
          .orderBy('created_at', 'desc')
          .limit(parseInt(limit))
          .offset(offset),
        db('exports')
          .where('user_id', req.user.id)
          .count('id as count')
      ]);

      const total = parseInt(countResult[0].count);
      
      exports = {
        data: data.map(e => ({
          ...e,
          filters: e.filters ? JSON.parse(e.filters) : {}
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    }

    res.json({
      success: true,
      ...exports
    });
  } catch (error) {
    console.error('Error listing exports:', error);
    next(error);
  }
});

// GET /api/admin/exports/:id
router.get('/:id', [
  param('id').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const exportService = req.app.locals.exportService;
    
    let status;
    
    // Try service first
    if (exportService && exportService.getExportStatus) {
      status = await exportService.getExportStatus(req.params.id, req.user.id);
    } else {
      // Fallback to direct database query
      const exportJob = await db('exports')
        .where('id', req.params.id)
        .where('user_id', req.user.id)
        .first();

      if (!exportJob) {
        return res.status(404).json({
          success: false,
          error: 'Export not found'
        });
      }

      status = {
        id: exportJob.id,
        type: exportJob.export_type,
        status: exportJob.status,
        filters: exportJob.filters ? JSON.parse(exportJob.filters) : {},
        created_at: exportJob.created_at,
        completed_at: exportJob.completed_at,
        download_url: exportJob.file_path,
        error: exportJob.error_message
      };
    }

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting export status:', error);
    next(error);
  }
});

// GET /api/admin/exports/:id/download
router.get('/:id/download', [
  param('id').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const exportService = req.app.locals.exportService;
    const fs = require('fs');
    const path = require('path');

    // Try service first
    if (exportService && exportService.getDownloadInfo) {
      const downloadInfo = await exportService.getDownloadInfo(req.params.id);

      if (!downloadInfo) {
        return res.status(404).json({
          success: false,
          error: 'Export not found or not ready'
        });
      }

      if (downloadInfo.url) {
        // Redirect to S3 URL
        return res.redirect(downloadInfo.url);
      } else if (downloadInfo.stream) {
        // Stream the file
        res.setHeader('Content-Type', downloadInfo.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
        return downloadInfo.stream.pipe(res);
      }
    }

    // Fallback to direct file handling
    const exportJob = await db('exports')
      .where('id', req.params.id)
      .where('user_id', req.user.id)
      .first();

    if (!exportJob || exportJob.status !== 'completed') {
      return res.status(404).json({
        success: false,
        error: 'Export not found or not ready'
      });
    }

    // Assume files are stored locally
    const filePath = path.join('/var/www/html/exports', `${exportJob.id}.csv`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Export file not found'
      });
    }

    const filename = `${exportJob.export_type}_export_${new Date(exportJob.created_at).getTime()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('Error downloading export:', error);
    next(error);
  }
});

// DELETE /api/admin/exports/:id
router.delete('/:id', [
  param('id').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    const db = req.app.locals.db;
    const exportService = req.app.locals.exportService;
    const fs = require('fs').promises;
    const path = require('path');

    let deleted;

    // Try service first
    if (exportService && exportService.deleteExport) {
      deleted = await exportService.deleteExport(req.params.id, req.user.id);
    } else {
      // Fallback to direct deletion
      const exportJob = await db('exports')
        .where('id', req.params.id)
        .where('user_id', req.user.id)
        .first();

      if (!exportJob) {
        return res.status(404).json({
          success: false,
          error: 'Export not found'
        });
      }

      // Delete database record
      await db('exports')
        .where('id', req.params.id)
        .delete();

      // Delete file if exists
      try {
        const filePath = path.join('/var/www/html/exports', `${exportJob.id}.csv`);
        await fs.unlink(filePath);
      } catch (e) {
        // File might not exist
      }

      deleted = true;
    }

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting export:', error);
    next(error);
  }
});

// Helper function to process exports (simplified)
async function processExport(exportId, type, filters, db) {
  const Papa = require('papaparse');
  const fs = require('fs').promises;
  const path = require('path');

  try {
    let data = [];
    let filename = '';

    // Generate export data based on type
    switch (type) {
      case 'players':
        const players = await db('player_profiles as pp')
          .leftJoin(
            db('scores')
              .select('player_profile_id')
              .count('* as games_played')
              .max('score as high_score')
              .groupBy('player_profile_id')
              .as('stats'),
            'pp.id', 'stats.player_profile_id'
          )
          .select(
            'pp.id',
            'pp.email',
            'pp.nickname',
            'pp.real_name',
            'pp.marketing_consent',
            'pp.created_at',
            db.raw('COALESCE(stats.games_played, 0) as games_played'),
            db.raw('COALESCE(stats.high_score, 0) as high_score')
          );

        data = players.map(p => ({
          id: p.id,
          email: p.email,
          nickname: p.nickname,
          real_name: p.real_name,
          marketing_consent: p.marketing_consent ? 'Yes' : 'No',
          games_played: p.games_played,
          high_score: p.high_score,
          joined: new Date(p.created_at).toLocaleDateString()
        }));
        
        filename = 'players_export.csv';
        break;

      case 'leaderboard':
        const period = filters.period || 'weekly';
        const leaderboard = await db.raw(`
          SELECT * FROM get_leaderboard(?, 1000)
        `, [period]);

        data = leaderboard.rows.map((row, index) => ({
          rank: index + 1,
          nickname: row.nickname,
          total_score: row.total_score,
          games_played: row.games_played,
          average_score: row.average_score
        }));
        
        filename = `leaderboard_${period}_export.csv`;
        break;

      case 'questions':
        const questions = await db('questions')
          .where('is_deleted', false)
          .select('*');

        data = questions.map(q => ({
          id: q.id,
          question: q.question,
          correct_answer: q.correct_answer,
          incorrect_answer_1: q.incorrect_answers[0] || '',
          incorrect_answer_2: q.incorrect_answers[1] || '',
          incorrect_answer_3: q.incorrect_answers[2] || '',
          category: q.category,
          difficulty: q.difficulty,
          is_flagged: q.is_flagged ? 'Yes' : 'No',
          is_custom: q.is_custom ? 'Yes' : 'No'
        }));
        
        filename = 'questions_export.csv';
        break;

      default:
        throw new Error(`Unsupported export type: ${type}`);
    }

    // Convert to CSV
    const csv = Papa.unparse(data);

    // Save file
    const exportPath = path.join('/var/www/html/exports', `${exportId}.csv`);
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, csv);

    // Update job status
    await db('exports')
      .where('id', exportId)
      .update({
        status: 'completed',
        completed_at: new Date(),
        file_path: `/exports/${exportId}.csv`,
        file_size: csv.length,
        row_count: data.length
      });

  } catch (error) {
    console.error('Export processing error:', error);
    
    // Update job with error
    await db('exports')
      .where('id', exportId)
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date()
      });
  }
}

module.exports = router;
