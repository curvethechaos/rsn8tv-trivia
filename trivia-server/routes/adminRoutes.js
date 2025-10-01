// routes/adminRoutes.js - Fixed to use app.locals services
const express = require('express');
const router = express.Router();

// Stats endpoint
router.get('/stats', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const [
      totalSessions,
      activeSessions,
      totalPlayers,
      registeredPlayers,
      totalQuestions
    ] = await Promise.all([
      db('sessions').count('id as count'),
      db('sessions').where('is_active', true).count('id as count'),
      db('players').count('id as count'),
      db('player_profiles').count('id as count'),
      db('questions').count('id as count')
    ]);

    res.json({
      success: true,
      stats: {
        totalSessions: parseInt(totalSessions[0].count) || 0,
        activeSessions: parseInt(activeSessions[0].count) || 0,
        totalPlayers: parseInt(totalPlayers[0].count) || 0,
        registeredPlayers: parseInt(registeredPlayers[0].count) || 0,
        totalQuestions: parseInt(totalQuestions[0].count) || 0,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Questions endpoint
router.get('/questions', async (req, res) => {
  try {
    const questionService = req.app.locals.questionService;
    
    if (!questionService || !questionService.getQuestions) {
      return res.status(500).json({ 
        success: false, 
        error: 'Question service not available' 
      });
    }

    const result = await questionService.getQuestions(req.query);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Questions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
});

// Themes endpoint
router.get('/themes', async (req, res) => {
  try {
    const themeService = req.app.locals.themeService;
    const db = req.app.locals.db;
    
    if (!themeService || !themeService.getAllThemes) {
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

// Sessions endpoint
router.get('/sessions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 50, active } = req.query;
    const offset = (page - 1) * limit;

    let query = db('sessions as s')
      .leftJoin(
        db('players')
          .select('session_id')
          .count('id as player_count')
          .groupBy('session_id')
          .as('pc'),
        's.id', 'pc.session_id'
      )
      .select(
        's.*',
        db.raw('COALESCE(pc.player_count, 0) as player_count')
      )
      .orderBy('s.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (active === 'true') {
      query = query.where('s.is_active', true);
    }

    const sessions = await query;
    const [totalResult] = await db('sessions').count('id as count');

    res.json({
      success: true,
      data: sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.count),
        pages: Math.ceil(totalResult.count / limit)
      }
    });
  } catch (error) {
    console.error('Sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// Players endpoint  
router.get('/players', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 50, search, hasEmail } = req.query;
    const offset = (page - 1) * limit;

    let query = db('player_profiles as pp')
      .leftJoin(
        db('scores')
          .select('player_profile_id')
          .count('id as games_played')
          .max('score as highest_score')
          .groupBy('player_profile_id')
          .as('game_stats'),
        'pp.id', 'game_stats.player_profile_id'
      )
      .select(
        'pp.*',
        db.raw('COALESCE(game_stats.games_played, 0) as games_played'),
        db.raw('COALESCE(game_stats.highest_score, 0) as highest_score')
      )
      .orderBy('pp.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (search) {
      query = query.where(function() {
        this.where('pp.nickname', 'ilike', `%${search}%`)
            .orWhere('pp.email', 'ilike', `%${search}%`)
            .orWhere('pp.real_name', 'ilike', `%${search}%`);
      });
    }

    if (hasEmail === 'true') {
      query = query.whereNotNull('pp.email');
    }

    const players = await query;
    const [totalResult] = await db('player_profiles').count('id as count');

    res.json({
      success: true,
      data: players,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.count),
        pages: Math.ceil(totalResult.count / limit)
      }
    });
  } catch (error) {
    console.error('Players error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch players' });
  }
});

// Current games endpoint
router.get('/current-games', async (req, res) => {
  try {
    const gameManager = req.app.locals.gameManager;
    const games = [];

    if (gameManager && gameManager.games) {
      gameManager.games.forEach((game, sessionId) => {
        games.push({
          sessionId,
          roomCode: game.roomCode,
          status: game.status,
          playerCount: game.players ? game.players.size : 0,
          currentQuestion: game.currentQuestion || 0,
          createdAt: game.createdAt
        });
      });
    }

    res.json({
      success: true,
      data: games
    });
  } catch (error) {
    console.error('Current games error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch current games' });
  }
});

module.exports = router;
