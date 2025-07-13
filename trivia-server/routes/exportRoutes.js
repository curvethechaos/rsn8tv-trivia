// routes/exportRoutes.js - Export management routes
const express = require('express');
const router = express.Router();
const { param, query, validationResult } = require('express-validator');

// Note: JWT authentication is already applied at the server level

// Create new export
router.post('/', async (req, res) => {
  try {
    const exportService = req.app.locals.exportService;
    const { type, filters } = req.body;

    // Validate export type
    const validTypes = ['players', 'leaderboard', 'questions', 'prizes', 'analytics'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid export type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Create export job
    const exportId = await exportService.createExport(type, filters || {}, req.user.id);

    res.json({
      success: true,
      data: { exportId }
    });

  } catch (error) {
    console.error('Error creating export:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create export'
    });
  }
});

// Get list of exports
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    try {
      const exportService = req.app.locals.exportService;
      const { page = 1, limit = 20 } = req.query;

      const exports = await exportService.listExports(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: exports
      });

    } catch (error) {
      console.error('Error listing exports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list exports'
      });
    }
  }
);

// Get export status
router.get('/:id', 
  [
    param('id').isUUID()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    try {
      const exportService = req.app.locals.exportService;
      const status = await exportService.getExportStatus(req.params.id, req.user.id);

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
      res.status(500).json({
        success: false,
        error: 'Failed to get export status'
      });
    }
  }
);

// Download export
router.get('/:id/download',
  [
    param('id').isUUID()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    try {
      const exportService = req.app.locals.exportService;
      const exportData = await exportService.getExport(req.params.id, req.user.id);

      if (!exportData) {
        return res.status(404).json({
          success: false,
          error: 'Export not found or not ready'
        });
      }

      // Get download URL or stream
      const downloadInfo = await exportService.getDownloadInfo(req.params.id);

      if (downloadInfo.url) {
        // Redirect to S3 URL
        res.redirect(downloadInfo.url);
      } else if (downloadInfo.stream) {
        // Stream the file
        res.setHeader('Content-Type', downloadInfo.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
        downloadInfo.stream.pipe(res);
      } else {
        throw new Error('No download method available');
      }

    } catch (error) {
      console.error('Error downloading export:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download export'
      });
    }
  }
);

// Delete export
router.delete('/:id',
  [
    param('id').isUUID()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    try {
      const exportService = req.app.locals.exportService;
      const deleted = await exportService.deleteExport(req.params.id, req.user.id);

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
      res.status(500).json({
        success: false,
        error: 'Failed to delete export'
      });
    }
  }
);

module.exports = router;
