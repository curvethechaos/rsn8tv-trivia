// routes/leaderboardRoutes.js - Fixed leaderboard with consistent response format
const express = require('express');
const router = express.Router();

// GET /api/leaderboards
router.get('/', async (req, res) => {
  const { period = 'weekly', limit = 100 } = req.query;
  const knex = req.app.locals.db;

  const validPeriods = ['weekly', 'monthly', 'quarterly', 'yearly'];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid period. Must be one of: weekly, monthly, quarterly, yearly'
    });
  }

  const numLimit = parseInt(limit);
  if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
    return res.status(400).json({
      success: false,
      error: 'Invalid limit. Must be between 1 and 1000'
    });
  }

  try {
    // Get current period dates
    const periodDates = await knex.raw(`
      SELECT
        get_period_start(CURRENT_DATE, ?) as start_date,
        get_period_end(CURRENT_DATE, ?) as end_date
    `, [period, period]);

    const { start_date, end_date } = periodDates.rows[0];

    // Get leaderboard
    const leaderboard = await knex.raw(`
      SELECT * FROM get_leaderboard(?, ?)
    `, [period, numLimit]);

    // ✅ FIX: Consistent field mapping
    const formattedLeaderboard = leaderboard.rows.map(row => ({
      rank: row.rank_position || row.rank,
      playerId: row.player_profile_id,
      nickname: row.nickname,
      score: row.total_score,
      gamesPlayed: row.games_played,
      averageScore: parseFloat(row.average_score).toFixed(2),
      period: period
    }));

    res.json({
      success: true,
      period,
      currentPeriod: {
        start: start_date,
        end: end_date
      },
      data: formattedLeaderboard
    });

  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

// GET /api/leaderboards/player/:playerId
router.get('/player/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const knex = req.app.locals.db;

  try {
    const rankings = await knex('leaderboards as l')
      .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
      .where('pp.id', playerId)
      .whereRaw('l.period_start <= CURRENT_DATE')
      .whereRaw('l.period_end >= CURRENT_DATE')
      .select(
        'l.period_type',
        'l.rank_position',
        'l.total_score',
        'l.games_played',
        'l.average_score',
        'pp.nickname'
      );

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Player not found or has no leaderboard entries'
      });
    }

    const formattedRankings = {};
    rankings.forEach(r => {
      formattedRankings[r.period_type] = {
        rank: r.rank_position,
        totalScore: r.total_score,
        gamesPlayed: r.games_played,
        averageScore: parseFloat(r.average_score)
      };
    });

    res.json({
      success: true,
      playerId,
      nickname: rankings[0].nickname,
      rankings: formattedRankings
    });

  } catch (error) {
    console.error('Player rankings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player rankings'
    });
  }
});

module.exports = router;
