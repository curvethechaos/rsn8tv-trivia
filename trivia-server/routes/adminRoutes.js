const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// Temporarily comment out problematic service imports
// const prizeService = new PrizeService();
// const questionService = new QuestionService();
// const themeService = new ThemeService();
// const brandingService = new BrandingService();
// const exportService = new ExportService();

// Import services correctly (they're already instantiated)
const prizeService = require('../services/prizeService');
const questionService = require('../services/questionService');
const themeService = require('../services/themeService');
const brandingService = require('../services/brandingService');
const exportService = require('../services/exportService');

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

module.exports = router;

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
