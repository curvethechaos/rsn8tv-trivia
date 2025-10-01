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

// Get all players with complete stats and leaderboard rankings
router.get('/players', async (req, res) => {
    try {
        // Get database from app locals (matching sessions endpoint pattern)
        const db = req.app.locals.db;

        const {
            page = 1,
            limit = 50,
            search = '',
            hasEmail,
            marketingConsent,
            minScore,
            minTotalScore,
            dateFrom,
            dateTo,
            prizeEligible,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        // Build the query using exact schema
        let query = db('player_profiles as pp')
            // Get game stats from scores table (all-time)
            .leftJoin(
                db('scores')
                    .select('player_profile_id')
                    .count('* as games_played')
                    .max('score as highest_score')
                    .sum('score as total_score')
                    .groupBy('player_profile_id')
                    .as('game_stats'),
                'pp.id', 'game_stats.player_profile_id'
            )
            // Get last played date from scores
            .leftJoin(
                db('scores as last_game')
                    .select('player_profile_id')
                    .max('submitted_at as last_played')
                    .groupBy('player_profile_id')
                    .as('last_played_stats'),
                'pp.id', 'last_played_stats.player_profile_id'
            )
            // Weekly score - HIGHEST score for current week
            .leftJoin(
                db('scores as weekly_scores')
                    .select('player_profile_id')
                    .max('score as weekly_score')
                    .whereRaw(`DATE_TRUNC('week', submitted_at) = DATE_TRUNC('week', CURRENT_DATE)`)
                    .groupBy('player_profile_id')
                    .as('weekly_stats'),
                'pp.id', 'weekly_stats.player_profile_id'
            )
            // Monthly score - SUM of scores for current month
            .leftJoin(
                db('scores as monthly_scores')
                    .select('player_profile_id')
                    .sum('score as monthly_score')
                    .whereRaw(`DATE_TRUNC('month', submitted_at) = DATE_TRUNC('month', CURRENT_DATE)`)
                    .groupBy('player_profile_id')
                    .as('monthly_stats'),
                'pp.id', 'monthly_stats.player_profile_id'
            )
            // Quarterly score - SUM of scores for current quarter
            .leftJoin(
                db('scores as quarterly_scores')
                    .select('player_profile_id')
                    .sum('score as quarterly_score')
                    .whereRaw(`DATE_TRUNC('quarter', submitted_at) = DATE_TRUNC('quarter', CURRENT_DATE)`)
                    .groupBy('player_profile_id')
                    .as('quarterly_stats'),
                'pp.id', 'quarterly_stats.player_profile_id'
            )
            // Yearly score - SUM of scores for current year
            .leftJoin(
                db('scores as yearly_scores')
                    .select('player_profile_id')
                    .sum('score as yearly_score')
                    .whereRaw(`DATE_TRUNC('year', submitted_at) = DATE_TRUNC('year', CURRENT_DATE)`)
                    .groupBy('player_profile_id')
                    .as('yearly_stats'),
                'pp.id', 'yearly_stats.player_profile_id'
            )
            // Get leaderboard ranks (keeping existing functionality)
            .leftJoin(
                db('leaderboards as weekly_ranks')
                    .select('player_profile_id', 'rank_position as weekly_rank')
                    .where('period_type', 'weekly')
                    .whereRaw(`period_start = date_trunc('week', CURRENT_DATE)`)
                    .as('weekly_rank_stats'),
                'pp.id', 'weekly_rank_stats.player_profile_id'
            )
            .leftJoin(
                db('leaderboards as monthly_ranks')
                    .select('player_profile_id', 'rank_position as monthly_rank')
                    .where('period_type', 'monthly')
                    .whereRaw(`period_start = date_trunc('month', CURRENT_DATE)`)
                    .as('monthly_rank_stats'),
                'pp.id', 'monthly_rank_stats.player_profile_id'
            )
            .leftJoin(
                db('leaderboards as quarterly_ranks')
                    .select('player_profile_id', 'rank_position as quarterly_rank')
                    .where('period_type', 'quarterly')
                    .whereRaw(`period_start = date_trunc('quarter', CURRENT_DATE)`)
                    .as('quarterly_rank_stats'),
                'pp.id', 'quarterly_rank_stats.player_profile_id'
            )
            .leftJoin(
                db('leaderboards as yearly_ranks')
                    .select('player_profile_id', 'rank_position as yearly_rank')
                    .where('period_type', 'yearly')
                    .whereRaw(`period_start = date_trunc('year', CURRENT_DATE)`)
                    .as('yearly_rank_stats'),
                'pp.id', 'yearly_rank_stats.player_profile_id'
            )
            .select(
                'pp.id',
                'pp.email',
                'pp.real_name',
                'pp.nickname',
                'pp.marketing_consent',
                'pp.created_at',
                'pp.device_fingerprint',
                db.raw('COALESCE(game_stats.games_played, 0) as games_played'),
                db.raw('COALESCE(game_stats.highest_score, 0) as highest_score'),
                db.raw('COALESCE(game_stats.total_score, 0) as total_score'),
                'last_played_stats.last_played',
                db.raw('COALESCE(weekly_stats.weekly_score, 0) as weekly_score'),
                db.raw('COALESCE(monthly_stats.monthly_score, 0) as monthly_score'),
                db.raw('COALESCE(quarterly_stats.quarterly_score, 0) as quarterly_score'),
                db.raw('COALESCE(yearly_stats.yearly_score, 0) as yearly_score'),
                db.raw('COALESCE(weekly_rank_stats.weekly_rank, 0) as weekly_rank'),
                db.raw('COALESCE(monthly_rank_stats.monthly_rank, 0) as monthly_rank'),
                db.raw('COALESCE(quarterly_rank_stats.quarterly_rank, 0) as quarterly_rank'),
                db.raw('COALESCE(yearly_rank_stats.yearly_rank, 0) as yearly_rank')
            );

        // Apply search filter
        if (search) {
            query = query.where(function() {
                this.where('pp.nickname', 'ilike', `%${search}%`)
                    .orWhere('pp.email', 'ilike', `%${search}%`)
                    .orWhere('pp.real_name', 'ilike', `%${search}%`);
            });
        }

        // Apply email filter
        if (hasEmail === 'true') {
            query = query.whereNotNull('pp.email').where('pp.email', '!=', '');
        } else if (hasEmail === 'false') {
            query = query.where(function() {
                this.whereNull('pp.email').orWhere('pp.email', '=', '');
            });
        }

        // Apply marketing consent filter
        if (marketingConsent === 'true') {
            query = query.where('pp.marketing_consent', true);
        } else if (marketingConsent === 'false') {
            query = query.where('pp.marketing_consent', false);
        }

        // Apply date filters
        if (dateFrom) {
            query = query.where('pp.created_at', '>=', dateFrom);
        }

        if (dateTo) {
            query = query.where('pp.created_at', '<=', dateTo + ' 23:59:59');
        }

        // Apply prize eligibility filter BEFORE grouping
        if (prizeEligible === 'threshold') {
            // Get players who have scored 8,500+ in current week
            query = query.whereExists(function() {
                this.select('*')
                    .from('scores')
                    .whereRaw('scores.player_profile_id = pp.id')
                    .where('scores.score', '>=', 8500)
                    .whereRaw(`DATE_TRUNC('week', scores.submitted_at) = DATE_TRUNC('week', CURRENT_DATE)`);
            });
        } else if (prizeEligible === 'weekly') {
            query = query.whereNotNull('weekly_rank_stats.weekly_rank')
                .where('weekly_rank_stats.weekly_rank', '>', 0)
                .where('weekly_rank_stats.weekly_rank', '<=', 10);
        } else if (prizeEligible === 'monthly') {
            query = query.whereNotNull('monthly_rank_stats.monthly_rank')
                .where('monthly_rank_stats.monthly_rank', '>', 0)
                .where('monthly_rank_stats.monthly_rank', '<=', 10);
        }

        // Clone query for counting before grouping
        const countQuery = query.clone()
            .clearSelect()
            .clearOrder()
            .select('pp.id');

        // Apply groupBy for aggregate functions
        query = query.groupBy(
            'pp.id',
            'pp.email',
            'pp.real_name',
            'pp.nickname',
            'pp.marketing_consent',
            'pp.created_at',
            'pp.device_fingerprint',
            'last_played_stats.last_played',
            'weekly_stats.weekly_score',
            'monthly_stats.monthly_score',
            'quarterly_stats.quarterly_score',
            'yearly_stats.yearly_score',
            'weekly_rank_stats.weekly_rank',
            'monthly_rank_stats.monthly_rank',
            'quarterly_rank_stats.quarterly_rank',
            'yearly_rank_stats.yearly_rank',
            'game_stats.games_played',
            'game_stats.highest_score',
            'game_stats.total_score'
        );

        // Apply score filters AFTER grouping using column aliases
        if (minScore) {
            query = query.having('highest_score', '>=', parseInt(minScore));
        }

        if (minTotalScore) {
            query = query.having('total_score', '>=', parseInt(minTotalScore));
        }

        // Get total count (simplified without having clauses)
        let totalResult;
        if (minScore || minTotalScore) {
            // If we have score filters, we need to count after grouping
            const countResults = await countQuery
                .groupBy('pp.id', 'game_stats.games_played', 'game_stats.highest_score', 'game_stats.total_score')
                .havingRaw(minScore ? 'COALESCE(game_stats.highest_score, 0) >= ?' : '1=1', minScore ? [parseInt(minScore)] : [])
                .havingRaw(minTotalScore ? 'COALESCE(game_stats.total_score, 0) >= ?' : '1=1', minTotalScore ? [parseInt(minTotalScore)] : []);
            totalResult = countResults.length;
        } else {
            // Simple count without score filters
            const countResults = await countQuery.groupBy('pp.id');
            totalResult = countResults.length;
        }

        // Apply sorting
        const validSortFields = {
            'nickname': 'pp.nickname',
            'real_name': 'pp.real_name',
            'email': 'pp.email',
            'games_played': 'games_played',
            'highest_score': 'highest_score',
            'total_score': 'total_score',
            'created_at': 'pp.created_at',
            'last_played': 'last_played_stats.last_played',
            'weekly_score': 'weekly_score',
            'monthly_score': 'monthly_score',
            'quarterly_score': 'quarterly_score',
            'yearly_score': 'yearly_score'
        };

        const sortField = validSortFields[sortBy] || 'pp.created_at';
        const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';

        query = query.orderBy(sortField, validSortOrder);

        // Apply pagination
        query = query.limit(limit).offset(offset);

        const players = await query;

        // Calculate stats for the top boxes - ADDED FOR STATS FIX
        const statsData = await db('player_profiles')
            .select(
                db.raw('COUNT(*) as total'),
                db.raw('COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as registered_today')
            )
            .first();

        res.json({
            success: true,
            data: players,
            pagination: {
                total: totalResult,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalResult / limit)
            },
            stats: {
                total: parseInt(statsData.total) || 0,
                registeredToday: parseInt(statsData.registered_today) || 0
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

// Current games endpoint - shows active game sessions
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
