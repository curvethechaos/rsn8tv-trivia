// routes/prizeRoutes.js - Prize management routes
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// GET /api/admin/prizes/time-based
router.get('/time-based', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const prizeService = req.app.locals.prizeService;

    let prizes;
    
    // Try service first
    if (prizeService && prizeService.getTimeBasedPrizes) {
      prizes = await prizeService.getTimeBasedPrizes();
    } else {
      // Fallback to direct database query
      const prizeRows = await db('prize_configurations')
        .where('type', 'time_based')
        .select('*')
        .orderBy('period');

      prizes = {
        weekly: prizeRows.find(p => p.period === 'weekly') || {},
        monthly: prizeRows.find(p => p.period === 'monthly') || {},
        quarterly: prizeRows.find(p => p.period === 'quarterly') || {},
        yearly: prizeRows.find(p => p.period === 'yearly') || {}
      };
    }

    res.json({
      success: true,
      data: prizes
    });
  } catch (error) {
    console.error('Error fetching time-based prizes:', error);
    next(error);
  }
});

// GET /api/admin/prizes/threshold
router.get('/threshold', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const prizeService = req.app.locals.prizeService;

    let threshold;
    
    // Try service first
    if (prizeService && prizeService.getThresholdPrize) {
      threshold = await prizeService.getThresholdPrize();
    } else {
      // Fallback to direct database query
      const thresholdRow = await db('prize_configurations')
        .where('type', 'threshold')
        .where('period', 'weekly')
        .first();

      threshold = thresholdRow || {
        type: 'threshold',
        period: 'weekly',
        min_score: 8500,
        description: 'Achieve 8,500 points in a single week',
        prize_value: 'Sponsor coupons'
      };
    }

    res.json({
      success: true,
      data: threshold
    });
  } catch (error) {
    console.error('Error fetching threshold prize:', error);
    next(error);
  }
});

// POST /api/admin/prizes/time-based/:period
router.post('/time-based/:period', [
  body('description').optional().isString().isLength({ max: 1000 }),
  body('prize_value').optional().isString().isLength({ max: 500 }),
  body('email_template').optional().isString()
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
    const prizeService = req.app.locals.prizeService;
    const { period } = req.params;
    const validPeriods = ['weekly', 'monthly', 'quarterly', 'yearly'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period type'
      });
    }

    const prizeData = {
      type: 'time_based',
      period: period,
      description: req.body.description,
      prize_value: req.body.prize_value,
      updated_at: new Date()
    };

    // Try service first
    if (prizeService && prizeService.updateTimeBasedPrize) {
      const result = await prizeService.updateTimeBasedPrize(period, prizeData);
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database
    await db('prize_configurations')
      .insert({
        ...prizeData,
        created_at: new Date()
      })
      .onConflict(['type', 'period'])
      .merge();

    res.json({
      success: true,
      data: prizeData
    });
  } catch (error) {
    console.error('Error updating time-based prize:', error);
    next(error);
  }
});

// POST /api/admin/prizes/threshold
router.post('/threshold', [
  body('threshold_points').isInt({ min: 1000, max: 50000 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  body('prize_value').optional().isString().isLength({ max: 500 }),
  body('email_template').optional().isString()
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
    const prizeService = req.app.locals.prizeService;

    const prizeData = {
      type: 'threshold',
      period: 'weekly',
      min_score: req.body.threshold_points,
      description: req.body.description,
      prize_value: req.body.prize_value,
      updated_at: new Date()
    };

    // Try service first
    if (prizeService && prizeService.updateThresholdPrize) {
      const result = await prizeService.updateThresholdPrize(prizeData);
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database
    await db('prize_configurations')
      .insert({
        ...prizeData,
        created_at: new Date()
      })
      .onConflict(['type', 'period'])
      .merge();

    res.json({
      success: true,
      data: prizeData
    });
  } catch (error) {
    console.error('Error updating threshold prize:', error);
    next(error);
  }
});

// GET /api/admin/prizes/winners
router.get('/winners', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const prizeService = req.app.locals.prizeService;
    const { period = 'weekly', type = 'time-based', date } = req.query;

    let winners;

    // Try service first
    if (prizeService && prizeService.getPrizeWinners) {
      winners = await prizeService.getPrizeWinners(period, type, date);
    } else {
      // Fallback to direct database query
      if (type === 'time-based') {
        // Get the highest scorer for the period
        const result = await db.raw(`
          SELECT 
            pp.id,
            pp.nickname,
            pp.email,
            pp.real_name,
            l.total_score as score,
            l.rank_position,
            l.period_start,
            l.period_end
          FROM leaderboards l
          JOIN player_profiles pp ON l.player_profile_id = pp.id
          WHERE l.period_type = ?
            AND l.rank_position = 1
            AND (? IS NULL OR l.period_start <= ?::date)
            AND (? IS NULL OR l.period_end >= ?::date)
          ORDER BY l.period_start DESC
          LIMIT 10
        `, [period, date, date, date, date]);

        winners = result.rows;
      } else {
        // Get threshold achievers
        const result = await db.raw(`
          SELECT DISTINCT
            pp.id,
            pp.nickname,
            pp.email,
            pp.real_name,
            l.total_score as score,
            l.period_start,
            l.period_end
          FROM leaderboards l
          JOIN player_profiles pp ON l.player_profile_id = pp.id
          WHERE l.period_type = 'weekly'
            AND l.total_score >= 8500
            AND (? IS NULL OR l.period_start <= ?::date)
            AND (? IS NULL OR l.period_end >= ?::date)
          ORDER BY l.period_start DESC, l.total_score DESC
          LIMIT 50
        `, [date, date, date, date]);

        winners = result.rows;
      }
    }

    res.json({
      success: true,
      data: winners || []
    });
  } catch (error) {
    console.error('Error fetching prize winners:', error);
    next(error);
  }
});

// POST /api/admin/prizes/notify-winner
router.post('/notify-winner', [
  body('player_id').isInt(),
  body('period_type').isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
  body('prize_type').isIn(['time-based', 'threshold'])
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
    const emailService = req.app.locals.emailService;
    const { player_id, period_type, prize_type } = req.body;

    // Get player info
    const player = await db('player_profiles')
      .where('id', player_id)
      .first();

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Get prize configuration
    const prizeConfig = await db('prize_configurations')
      .where('type', prize_type)
      .where('period', period_type)
      .first();

    if (!prizeConfig || !prizeConfig.email_template) {
      return res.status(400).json({
        success: false,
        error: 'Prize configuration or email template not found'
      });
    }

    // Send notification
    if (emailService && emailService.sendPrizeNotification) {
      await emailService.sendPrizeNotification(player, prizeConfig, prize_type === 'threshold');
    } else {
      // Log notification request for manual processing
      await db('prize_notifications').insert({
        player_profile_id: player_id,
        period_type,
        prize_type,
        notification_type: 'email',
        status: 'pending',
        created_at: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Winner notification sent'
    });
  } catch (error) {
    console.error('Error sending winner notification:', error);
    next(error);
  }
});

// GET /api/admin/prizes/statistics
router.get('/statistics', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    const stats = await db.raw(`
      SELECT 
        period_type,
        COUNT(DISTINCT CASE WHEN rank_position = 1 THEN player_profile_id END) as time_based_winners,
        COUNT(DISTINCT CASE WHEN total_score >= 8500 THEN player_profile_id END) as threshold_achievers,
        MAX(total_score) as highest_score,
        AVG(CASE WHEN rank_position <= 10 THEN total_score END) as avg_top10_score
      FROM leaderboards
      WHERE (? IS NULL OR period_start >= ?::date)
        AND (? IS NULL OR period_end <= ?::date)
      GROUP BY period_type
    `, [start_date, start_date, end_date, end_date]);

    res.json({
      success: true,
      data: stats.rows
    });
  } catch (error) {
    console.error('Error fetching prize statistics:', error);
    next(error);
  }
});

module.exports = router;
