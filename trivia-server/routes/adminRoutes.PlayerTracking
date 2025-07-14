// routes/adminRoutes.js - Admin management routes
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

// Note: JWT authentication is already applied at the server level for all /api/admin routes
// No need to apply authMiddleware here again

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const cache = req.app.locals.cache;

    // Get various statistics
    const [
      totalSessions,
      activeSessions,
      totalPlayers,
      registeredPlayers,
      totalQuestions,
      cacheStats
    ] = await Promise.all([
      db('sessions').count('id as count'),
      db('sessions').where('is_active', true).count('id as count'),
      db('players').count('id as count'),
      db('player_profiles').count('id as count'),
      db('questions_cache').count('id as count'),
      Promise.resolve(cache ? cache.getStats() : { hits: 0, misses: 0, keys: 0 })
    ]);

    // Get recent activity
    const recentSessions = await db('sessions')
      .orderBy('created_at', 'desc')
      .limit(10)
      .select('id', 'room_code', 'is_active', 'created_at');

    const recentPlayers = await db('player_profiles')
      .orderBy('created_at', 'desc')
      .limit(10)
      .select('id', 'nickname', 'email', 'created_at');

    res.json({
      success: true,
      stats: {
        sessions: {
          total: parseInt(totalSessions[0].count),
          active: parseInt(activeSessions[0].count)
        },
        players: {
          total: parseInt(totalPlayers[0].count),
          registered: parseInt(registeredPlayers[0].count)
        },
        questions: {
          cached: parseInt(totalQuestions[0].count)
        },
        cache: cacheStats
      },
      recentActivity: {
        sessions: recentSessions,
        players: recentPlayers
      }
    });

  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Get all sessions with pagination
router.get('/sessions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 50, active } = req.query;
    const offset = (page - 1) * limit;

    let query = db('sessions as s')
      .leftJoin(
        db('players')
          .select('session_id')
          .count('* as player_count')
          .groupBy('session_id')
          .as('p'),
        's.id', 'p.session_id'
      )
      .select(
        's.id',
        's.room_code',
        's.is_active',
        's.created_at',
        db.raw('COALESCE(p.player_count, 0) as player_count')
      );

    if (active !== undefined) {
      query = query.where('s.is_active', active === 'true');
    }

    const sessions = await query
      .orderBy('s.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalCount = await db('sessions')
      .where(active !== undefined ? { is_active: active === 'true' } : {})
      .count('id as count');

    res.json({
      success: true,
      data: sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalCount[0].count),
        pages: Math.ceil(totalCount[0].count / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

// Clear cache
router.post('/cache/clear', async (req, res) => {
  try {
    const cache = req.app.locals.cache;
    const { pattern } = req.body;

    if (cache && cache.flushAll) {
      if (pattern) {
        const keys = await cache.keys(pattern);
        for (const key of keys) {
          await cache.del(key);
        }
        res.json({
          success: true,
          message: `Cleared ${keys.length} cache entries matching pattern: ${pattern}`
        });
      } else {
        await cache.flushAll();
        res.json({
          success: true,
          message: 'All cache cleared'
        });
      }
    } else {
      res.json({
        success: true,
        message: 'No cache configured'
      });
    }

  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

// Phase 1: Theme Management
router.get('/theme', async (req, res) => {
  try {
    const themeService = req.app.locals.themeService;
    const theme = await themeService.getCurrentTheme();

    res.json({
      success: true,
      data: theme
    });
  } catch (error) {
    console.error('Error fetching theme:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch theme'
    });
  }
});

router.post('/theme',
  [
    body('colors').isObject(),
    body('fonts').optional().isObject(),
    body('animations').optional().isObject()
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
      const themeService = req.app.locals.themeService;
      const theme = await themeService.updateTheme(req.body, req.user.id);

      res.json({
        success: true,
        data: theme
      });
    } catch (error) {
      console.error('Error updating theme:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update theme'
      });
    }
  }
);

// Phase 1: Branding Management
router.get('/branding', async (req, res) => {
  try {
    const brandingService = req.app.locals.brandingService;
    const branding = await brandingService.getCurrentBranding();

    res.json({
      success: true,
      data: branding
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch branding'
    });
  }
});

router.post('/branding/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const brandingService = req.app.locals.brandingService;
    const result = await brandingService.uploadLogo(req.file, 'main');

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload logo'
    });
  }
});

router.post('/branding/favicon', upload.single('favicon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const brandingService = req.app.locals.brandingService;
    const result = await brandingService.uploadLogo(req.file, 'favicon');

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error uploading favicon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload favicon'
    });
  }
});

router.post('/branding/sponsors', upload.single('sponsor'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const brandingService = req.app.locals.brandingService;
    const result = await brandingService.uploadSponsorLogo(req.file);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error uploading sponsor logo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload sponsor logo'
    });
  }
});

// Phase 1: Question Management
router.get('/questions', async (req, res) => {
  try {
    const questionService = req.app.locals.questionService;
    const { page = 1, limit = 50, difficulty, category, search, status } = req.query;

    const result = await questionService.getQuestions({
      page: parseInt(page),
      limit: parseInt(limit),
      difficulty,
      category,
      search,
      status
    });

    res.json({
      success: true,
      data: result.questions,
      totalCount: result.totalCount,
      flaggedCount: result.flaggedCount,
      customCount: result.customCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.totalCount,
        pages: Math.ceil(result.totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

router.post('/questions/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const questionService = req.app.locals.questionService;
    const result = await questionService.importQuestions(req.file);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error importing questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import questions'
    });
  }
});

router.get('/questions/export', async (req, res) => {
  try {
    const questionService = req.app.locals.questionService;
    const exportService = req.app.locals.exportService;

    const exportId = await exportService.createExport('questions', req.query, req.user.id);

    res.json({
      success: true,
      data: { exportId }
    });
  } catch (error) {
    console.error('Error exporting questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export questions'
    });
  }
});

router.post('/questions/:id/flag', async (req, res) => {
  try {
    const questionService = req.app.locals.questionService;
    const result = await questionService.flagQuestion(req.params.id, req.user.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error flagging question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flag question'
    });
  }
});

// Phase 1: Prize Management
router.get('/prizes/time-based', async (req, res) => {
  try {
    const prizeService = req.app.locals.prizeService;
    const prizes = await prizeService.getTimeBasedPrizes();

    res.json({
      success: true,
      data: prizes
    });
  } catch (error) {
    console.error('Error fetching time-based prizes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prizes'
    });
  }
});

router.get('/prizes/threshold', async (req, res) => {
  try {
    const prizeService = req.app.locals.prizeService;
    const threshold = await prizeService.getThresholdPrize();

    res.json({
      success: true,
      data: threshold
    });
  } catch (error) {
    console.error('Error fetching threshold prize:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch threshold prize'
    });
  }
});

router.get('/prizes/winners', async (req, res) => {
  try {
    const prizeService = req.app.locals.prizeService;
    const { period = 'weekly', type = 'time-based' } = req.query;

    const winners = await prizeService.getPrizeWinners(period, type);

    res.json({
      success: true,
      data: winners
    });
  } catch (error) {
    console.error('Error fetching prize winners:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch winners'
    });
  }
});

// Phase 1: Player Management
router.get('/players', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 50, search, hasEmail } = req.query;
    const offset = (page - 1) * limit;

    let query = db('player_profiles as pp')
      .leftJoin(
        db('scores')
          .select('player_id', db.raw('COUNT(*) as games_played'), db.raw('MAX(score) as high_score'))
          .groupBy('player_id')
          .as('s'),
        'pp.id', 's.player_id'
      )
      .select(
        'pp.id',
        'pp.nickname',
        'pp.email',
        'pp.real_name',
        'pp.marketing_consent',
        'pp.created_at',
        db.raw('COALESCE(s.games_played, 0) as games_played'),
        db.raw('COALESCE(s.high_score, 0) as high_score')
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

    const players = await query
      .orderBy('pp.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalCount = await db('player_profiles')
      .where(search ? function() {
        this.where('nickname', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`)
          .orWhere('real_name', 'ilike', `%${search}%`);
      } : {})
      .count('id as count');

    res.json({
      success: true,
      data: players,
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

// Phase 1: Current Games
router.get('/current-games', async (req, res) => {
  try {
    const gameManager = req.app.locals.gameManager;
    const db = req.app.locals.db;

    const games = [];

    if (gameManager && gameManager.games) {
      for (const [sessionId, game] of gameManager.games) {
        const session = await db('sessions')
          .where('id', sessionId)
          .first();

        games.push({
          sessionId,
          roomCode: session?.room_code,
          status: game.status,
          currentRound: game.currentRound,
          playerCount: game.players?.size || 0,
          startedAt: game.startedAt,
          createdAt: game.createdAt
        });
      }
    }

    res.json({
      success: true,
      data: games
    });
  } catch (error) {
    console.error('Error fetching current games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current games'
    });
  }
});

module.exports = router;
