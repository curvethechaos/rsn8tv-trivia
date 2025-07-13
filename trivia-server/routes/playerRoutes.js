// playerRoutes.js - REST API Routes for player management
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = (db) => {
  // Get player profile
  router.get('/:profileId', [
    param('profileId').isInt().withMessage('Invalid profile ID')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { profileId } = req.params;
      
      const profile = await db('player_profiles')
        .where('id', profileId)
        .first();
        
      if (!profile) {
        return res.status(404).json({ error: 'Player profile not found' });
      }
      
      // Get player statistics
      const stats = await db('players')
        .where('player_profile_id', profileId)
        .count('* as games_played')
        .sum('score as total_score')
        .avg('score as average_score')
        .first();
      
      res.json({
        profile: {
          ...profile,
          games_played: parseInt(stats.games_played) || 0,
          total_score: parseInt(stats.total_score) || 0,
          average_score: parseFloat(stats.average_score) || 0
        }
      });
    } catch (error) {
      logger.error('Error fetching player profile:', error);
      res.status(500).json({ error: 'Failed to fetch player profile' });
    }
  });

  // Update player profile
  router.put('/:profileId', [
    param('profileId').isInt().withMessage('Invalid profile ID'),
    body('nickname').optional().isString().isLength({ min: 2, max: 20 }),
    body('marketingConsent').optional().isBoolean()
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { profileId } = req.params;
      const { nickname, marketingConsent } = req.body;
      
      const updateData = {};
      if (nickname !== undefined) updateData.nickname = nickname;
      if (marketingConsent !== undefined) {
        updateData.marketing_consent = marketingConsent;
        updateData.marketing_consent_timestamp = new Date();
      }
      
      const updated = await db('player_profiles')
        .where('id', profileId)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning('*');
        
      if (!updated.length) {
        return res.status(404).json({ error: 'Player profile not found' });
      }
      
      res.json({ 
        success: true, 
        profile: updated[0] 
      });
    } catch (error) {
      logger.error('Error updating player profile:', error);
      res.status(500).json({ error: 'Failed to update player profile' });
    }
  });

  // Get player game history
  router.get('/:profileId/history', [
    param('profileId').isInt().withMessage('Invalid profile ID')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { profileId } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      
      const games = await db('players as p')
        .join('sessions as s', 'p.session_id', 's.id')
        .where('p.player_profile_id', profileId)
        .select(
          'p.score',
          'p.created_at as played_at',
          's.room_code',
          's.id as session_id'
        )
        .orderBy('p.created_at', 'desc')
        .limit(limit)
        .offset(offset);
        
      const total = await db('players')
        .where('player_profile_id', profileId)
        .count('* as count')
        .first();
      
      res.json({
        games,
        total: parseInt(total.count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error fetching game history:', error);
      res.status(500).json({ error: 'Failed to fetch game history' });
    }
  });

  // Get player achievements
  router.get('/:profileId/achievements', [
    param('profileId').isInt().withMessage('Invalid profile ID')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { profileId } = req.params;
      
      // Get various achievement data
      const [perfectGames, highScores, totalGames] = await Promise.all([
        // Perfect games (all questions correct)
        db('players')
          .where('player_profile_id', profileId)
          .where('score', '>=', 5800) // Near perfect score
          .count('* as count')
          .first(),
          
        // High scores
        db('players')
          .where('player_profile_id', profileId)
          .where('score', '>=', 4000)
          .count('* as count')
          .first(),
          
        // Total games
        db('players')
          .where('player_profile_id', profileId)
          .count('* as count')
          .first()
      ]);
      
      const achievements = {
        perfectGames: parseInt(perfectGames.count) || 0,
        highScores: parseInt(highScores.count) || 0,
        totalGames: parseInt(totalGames.count) || 0,
        badges: []
      };
      
      // Award badges based on achievements
      if (achievements.perfectGames >= 1) {
        achievements.badges.push({ id: 'perfect_game', name: 'Perfect Game', icon: '🏆' });
      }
      if (achievements.highScores >= 10) {
        achievements.badges.push({ id: 'high_scorer', name: 'High Scorer', icon: '⭐' });
      }
      if (achievements.totalGames >= 50) {
        achievements.badges.push({ id: 'veteran', name: 'Trivia Veteran', icon: '🎖️' });
      }
      
      res.json(achievements);
    } catch (error) {
      logger.error('Error fetching achievements:', error);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  // Get session players
  router.get('/session/:sessionId', [
    param('sessionId').isUUID().withMessage('Invalid session ID')
  ], async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const players = await db('players as p')
        .leftJoin('player_profiles as pp', 'p.player_profile_id', 'pp.id')
        .where('p.session_id', sessionId)
        .select(
          'p.client_id',
          'p.temporary_name',
          'p.score',
          'p.created_at',
          'pp.nickname',
          'pp.id as profile_id'
        )
        .orderBy('p.score', 'desc');
      
      res.json({
        sessionId,
        players: players.map((p, index) => ({
          rank: index + 1,
          clientId: p.client_id,
          displayName: p.nickname || p.temporary_name,
          score: p.score,
          isRegistered: !!p.profile_id,
          joinedAt: p.created_at
        }))
      });
    } catch (error) {
      logger.error('Error fetching session players:', error);
      res.status(500).json({ error: 'Failed to fetch session players' });
    }
  });

  // Check if email exists
  router.post('/check-email', [
    body('email').isEmail().normalizeEmail()
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      
      const existing = await db('player_profiles')
        .where('email', email)
        .first();
      
      res.json({
        exists: !!existing,
        profileId: existing?.id
      });
    } catch (error) {
      logger.error('Error checking email:', error);
      res.status(500).json({ error: 'Failed to check email' });
    }
  });

  return router;
};
