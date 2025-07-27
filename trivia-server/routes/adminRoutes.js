const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// Import services correctly (they're already instantiated)
const prizeService = require('../services/prizeService');
const questionService = require('../services/questionService');
const themeService = require('../services/themeService');
const brandingService = require('../services/brandingService');
const exportService = require('../services/exportService');

// Delete player (hard delete with cascade)
router.delete('/players/:playerId', async (req, res) => {
    const { playerId } = req.params;

    try {
        const db = req.app.locals.db;

        // Start transaction for safe deletion
        await db.transaction(async (trx) => {
            // First verify player exists
            const player = await trx('player_profiles')
                .where('id', playerId)
                .first();

            if (!player) {
                throw new Error('Player not found');
            }

            // Delete in correct order to respect foreign key constraints
            // 1. Delete scores
            await trx('scores')
                .where('player_profile_id', playerId)
                .delete();

            // 2. Delete leaderboard entries
            await trx('leaderboards')
                .where('player_profile_id', playerId)
                .delete();

            // 3. Delete player instances from sessions
            await trx('players')
                .where('player_profile_id', playerId)
                .delete();

            // 4. Finally delete the player profile
            await trx('player_profiles')
                .where('id', playerId)
                .delete();
        });

        // Log the deletion
        logger.info(`Player ${playerId} deleted by admin ${req.user.id}`);

        res.json({
            success: true,
            message: 'Player deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting player:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete player'
        });
    }
});

// Stats endpoint
router.get('/stats', async (req, res) => {
    try {
        const stats = await db('sessions')
            .select(
                db.raw('COUNT(DISTINCT sessions.id) as total_sessions'),
                db.raw('COUNT(DISTINCT players.id) as total_players'),
                db.raw('COUNT(DISTINCT player_profiles.id) as registered_players')
            )
            .leftJoin('players', 'sessions.id', 'players.session_id')
            .leftJoin('player_profiles', 'players.player_profile_id', 'player_profiles.id')
            .first();

        res.json({
            success: true,
            stats: {
                totalSessions: parseInt(stats.total_sessions) || 0,
                totalPlayers: parseInt(stats.total_players) || 0,
                registeredPlayers: parseInt(stats.registered_players) || 0,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

// Questions endpoints
router.get('/questions', async (req, res) => {
    try {
        if (!questionService || !questionService.getQuestions) {
            // Fallback if service isn't available
            const questions = await db('question_cache')
                .select('*')
                .orderBy('id', 'desc')
                .limit(100);

            return res.json({
                success: true,
                questions,
                totalCount: questions.length,
                flaggedCount: 0,
                customCount: 0
            });
        }

        const result = await questionService.getQuestions(req.query);
        res.json(result);
    } catch (error) {
        console.error('Questions error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch questions' });
    }
});

// Themes endpoints
router.get('/themes', async (req, res) => {
    try {
        if (!themeService || !themeService.getAllThemes) {
            // Fallback
            const themes = await db('themes').select('*');
            return res.json({ success: true, themes });
        }

        const themes = await themeService.getAllThemes();
        res.json({ success: true, themes });
    } catch (error) {
        console.error('Themes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch themes' });
    }
});

// Prize endpoints
router.get('/prizes/time-based', async (req, res) => {
    try {
        if (!prizeService || !prizeService.getTimeBased) {
            // Fallback
            return res.json({
                success: true,
                prizes: {
                    weekly: { name: 'Weekly Champion', minimum_score: 0 },
                    monthly: { name: 'Monthly Master', minimum_score: 0 },
                    quarterly: { name: 'Quarterly Queen/King', minimum_score: 0 },
                    yearly: { name: 'Annual Legend', minimum_score: 0 }
                }
            });
        }

        const prizes = await prizeService.getTimeBased();
        res.json({ success: true, prizes });
    } catch (error) {
        console.error('Prizes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch prizes' });
    }
});

router.get('/prizes/threshold', async (req, res) => {
    try {
        if (!prizeService || !prizeService.getThreshold) {
            // Fallback
            return res.json({
                success: true,
                threshold: {
                    score: 8500,
                    name: 'Elite Player',
                    description: 'Score 8,500+ points in a week'
                }
            });
        }

        const threshold = await prizeService.getThreshold();
        res.json({ success: true, threshold });
    } catch (error) {
        console.error('Threshold error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch threshold' });
    }
});

// Branding endpoints
router.get('/branding', async (req, res) => {
    try {
        if (!brandingService || !brandingService.getCurrentBranding) {
            // Fallback
            return res.json({
                success: true,
                branding: {
                    main_logo_url: null,
                    favicon_url: null,
                    sponsor_logos: [],
                    company_name: 'RSN8TV Trivia',
                    tagline: 'Real-time multiplayer trivia',
                    footer_text: '© 2025 RSN8TV. All rights reserved.'
                }
            });
        }

        const branding = await brandingService.getCurrentBranding();
        res.json({ success: true, branding });
    } catch (error) {
        console.error('Branding error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch branding' });
    }
});

// Export endpoints
router.get('/exports', async (req, res) => {
    try {
        if (!exportService || !exportService.listExports) {
            // Fallback
            return res.json({ success: true, exports: [] });
        }

        const exports = await exportService.listExports(req.user.id);
        res.json({ success: true, exports });
    } catch (error) {
        console.error('Exports error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch exports' });
    }
});

// Get all sessions with pagination
router.get('/sessions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 50, active } = req.query;
    const offset = (page - 1) * limit;

    let query = db('sessions').select('*');

    if (active !== undefined) {
      query = query.where('is_active', active === 'true');
    }

    const sessions = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db('sessions').count('* as total');

    res.json({
      success: true,
      sessions,
      total: parseInt(total),
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

// Get all players with complete stats
router.get('/players', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, hasEmail, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;

    let query = db('player_profiles as pp')
      .leftJoin(
        db('scores')
          .select('player_profile_id',
            db.raw('COUNT(*) as games_played'),
            db.raw('MAX(score) as highest_score'),
            db.raw('SUM(score) as total_score'),
            db.raw('MAX(submitted_at) as last_played')
          )
          .groupBy('player_profile_id')
          .as('s'),
        'pp.id', 's.player_profile_id'
      )
      // Join with current period leaderboards
      .leftJoin(
        db('leaderboards')
          .select('player_profile_id', 'total_score as weekly_score', 'rank_position as weekly_rank')
          .where('period_type', 'weekly')
          .whereRaw('period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE')
          .as('lw'),
        'pp.id', 'lw.player_profile_id'
      )
      .leftJoin(
        db('leaderboards')
          .select('player_profile_id', 'total_score as monthly_score', 'rank_position as monthly_rank')
          .where('period_type', 'monthly')
          .whereRaw('period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE')
          .as('lm'),
        'pp.id', 'lm.player_profile_id'
      )
      .leftJoin(
        db('leaderboards')
          .select('player_profile_id', 'total_score as quarterly_score', 'rank_position as quarterly_rank')
          .where('period_type', 'quarterly')
          .whereRaw('period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE')
          .as('lq'),
        'pp.id', 'lq.player_profile_id'
      )
      .leftJoin(
        db('leaderboards')
          .select('player_profile_id', 'total_score as yearly_score', 'rank_position as yearly_rank')
          .where('period_type', 'yearly')
          .whereRaw('period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE')
          .as('ly'),
        'pp.id', 'ly.player_profile_id'
      )
      .select(
        'pp.id',
        'pp.nickname',
        'pp.email',
        'pp.real_name',
        'pp.marketing_consent',
        'pp.created_at',
        db.raw('COALESCE(s.games_played, 0) as games_played'),
        db.raw('COALESCE(s.highest_score, 0) as highest_score'),
        db.raw('COALESCE(s.total_score, 0) as total_score'),
        db.raw('COALESCE(lw.weekly_score, 0) as weekly_score'),
        db.raw('COALESCE(lm.monthly_score, 0) as monthly_score'),
        db.raw('COALESCE(lq.quarterly_score, 0) as quarterly_score'),
        db.raw('COALESCE(ly.yearly_score, 0) as yearly_score'),
        db.raw('COALESCE(lw.weekly_rank, null) as weekly_rank'),
        db.raw('COALESCE(lm.monthly_rank, null) as monthly_rank'),
        db.raw('COALESCE(lq.quarterly_rank, null) as quarterly_rank'),
        db.raw('COALESCE(ly.yearly_rank, null) as yearly_rank'),
        's.last_played',
        // Current winner status
        db.raw(`
          CASE
            WHEN lw.weekly_rank = 1 THEN 'W'
            WHEN lm.monthly_rank = 1 THEN 'M'
            WHEN lq.quarterly_rank = 1 THEN 'Q'
            WHEN ly.yearly_rank = 1 THEN 'Y'
            WHEN lw.weekly_score >= 8500 THEN 'T'
            ELSE NULL
          END as current_winner_status
        `)
      );

    if (search) {
      query = query.where(function() {
        this.where('pp.nickname', 'ilike', `%${search}%`)
          .orWhere('pp.email', 'ilike', `%${search}%`)
          .orWhere('pp.real_name', 'ilike', `%${search}%`);
      });
    }

    if (hasEmail !== undefined) {
      if (hasEmail === 'true') {
        query = query.whereNotNull('pp.email');
      } else {
        query = query.whereNull('pp.email');
      }
    }

    // Map frontend column names to database column names
    const sortMapping = {
      'nickname': 'pp.nickname',
      'real_name': 'pp.real_name', 
      'email': 'pp.email',
      'games_played': db.raw('COALESCE(s.games_played, 0)'),
      'highest_score': db.raw('COALESCE(s.highest_score, 0)'),
      'total_score': db.raw('COALESCE(s.total_score, 0)'),
      'weekly_score': db.raw('COALESCE(lw.weekly_score, 0)'),
      'monthly_score': db.raw('COALESCE(lm.monthly_score, 0)'),
      'quarterly_score': db.raw('COALESCE(lq.quarterly_score, 0)'),
      'yearly_score': db.raw('COALESCE(ly.yearly_score, 0)'),
      'created_at': 'pp.created_at',
      'last_played': 's.last_played',
      'marketing_consent': 'pp.marketing_consent',
      'has_won_prize': 'has_won_prize',
      'current_winner_status': 'current_winner_status'
    };

    const sortColumn = sortMapping[sortBy] || 'pp.created_at';

    const players = await query
      .orderBy(sortColumn, sortOrder)
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalCount = await db('player_profiles')
      .where(search ? function() {
        this.where('nickname', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`)
          .orWhere('real_name', 'ilike', `%${search}%`);
      } : {})
      .count('id as count');

    // Check for past winners
    const playerIds = players.map(p => p.id);
    const pastWinners = playerIds.length > 0 ? await db('leaderboards')
      .whereIn('player_profile_id', playerIds)
      .where(function() {
        this.where('rank_position', 1)
          .orWhere(function() {
            this.where('total_score', '>=', 8500)
              .where('period_type', 'weekly');
          });
      })
      .select('player_profile_id')
      .distinct() : [];

    const pastWinnerIds = new Set(pastWinners.map(w => w.player_profile_id));

    // Add past winner status
    const playersWithWinnerStatus = players.map(player => ({
      ...player,
      has_won_prize: pastWinnerIds.has(player.id)
    }));

    // Get stats for header
    const stats = await db('player_profiles as pp')
      .select(
        db.raw('COUNT(DISTINCT pp.id) as total'),
        db.raw('COUNT(DISTINCT CASE WHEN DATE(pp.created_at) = CURRENT_DATE THEN pp.id END) as registeredToday'),
        db.raw('COUNT(DISTINCT CASE WHEN pp.email IS NOT NULL AND pp.email != \'\' THEN pp.id END) as withEmail'),
        db.raw('COUNT(DISTINCT CASE WHEN pp.marketing_consent = true THEN pp.id END) as marketingConsent')
      )
      .first();

    res.json({
      success: true,
      players: playersWithWinnerStatus,
      stats: {
        total: parseInt(stats.total) || 0,
        registeredToday: parseInt(stats.registeredToday) || 0,
        withEmail: parseInt(stats.withEmail) || 0,
        marketingConsent: parseInt(stats.marketingConsent) || 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalCount[0].count),
        pages: Math.ceil(totalCount[0].count / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch players'
    });
  }
});

// Get player details for modal
router.get('/players/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    const player = await db('player_profiles')
      .where('id', playerId)
      .first();

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Get stats
    const stats = await db('scores')
      .where('player_profile_id', playerId)
      .select(
        db.raw('COUNT(DISTINCT session_id) as games_played'),
        db.raw('COALESCE(SUM(score), 0) as total_score'),
        db.raw('COALESCE(AVG(score), 0) as average_score'),
        db.raw('COALESCE(MAX(score), 0) as highest_score')
      )
      .first();

    const lastGame = await db('scores')
      .where('player_profile_id', playerId)
      .orderBy('submitted_at', 'desc')
      .select('submitted_at')
      .first();

    res.json({
      success: true,
      profile: {
        ...player,
        games_played: parseInt(stats.games_played) || 0,
        total_score: parseInt(stats.total_score) || 0,
        average_score: parseFloat(stats.average_score) || 0,
        highest_score: parseInt(stats.highest_score) || 0,
        last_played: lastGame?.submitted_at || null
      }
    });

  } catch (error) {
    console.error('Error fetching player details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player details'
    });
  }
});

module.exports = router;
