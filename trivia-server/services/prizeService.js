// services/prizeService.js - Prize management service
const db = require('../db/connection');

class PrizeService {
  constructor() {
    this.periods = ['weekly', 'monthly', 'quarterly', 'yearly'];
    this.thresholdAmount = 8500; // Weekly threshold achievement
  }

  //
  // ======== CRUD methods for /api/admin/prizes ========
  //

  // List all prize configurations
  async getAll() {
    return await db('prize_configurations').select('*');
  }

  // Get one prize by ID
  async getById(id) {
    return await db('prize_configurations').where({ id }).first();
  }

  // Create a new prize configuration
  async create(data) {
    const [newPrize] = await db('prize_configurations').insert(data).returning('*');
    return newPrize;
  }

  // Update an existing prize configuration
  async update(id, data) {
    const [updated] = await db('prize_configurations').where({ id }).update(data).returning('*');
    return updated;
  }

  // Delete a prize configuration
  async remove(id) {
    return await db('prize_configurations').where({ id }).del();
  }

  //
  // ======== Existing methods ========
  //

  // Get time-based prize configurations
  async getTimeBasedPrizes() {
    const prizes = await db('prize_configurations')
      .where('type', 'time-based')
      .orderBy('period_order');

    if (prizes.length === 0) {
      // Return default configuration
      return this.periods.map((period, index) => ({
        period,
        period_order: index,
        type: 'time-based',
        description: `Highest score wins for ${period} period`,
        prize_value: '',
        min_score: null, // No minimum for time-based prizes
        enabled: true
      }));
    }

    return prizes;
  }

  // Get threshold prize configuration
  async getThresholdPrize() {
    const threshold = await db('prize_configurations')
      .where('type', 'threshold')
      .where('period', 'weekly')
      .first();

    if (!threshold) {
      // Return default threshold configuration
      return {
        period: 'weekly',
        type: 'threshold',
        description: 'Achieve 8,500 points in a single week',
        prize_value: 'Sponsor coupon',
        min_score: this.thresholdAmount,
        enabled: true
      };
    }

    return threshold;
  }

  // Update time-based prize
  async updateTimeBasedPrize(period, updates) {
    const validPeriods = this.periods;
    if (!validPeriods.includes(period)) {
      throw new Error('Invalid period');
    }

    const existing = await db('prize_configurations')
      .where('type', 'time-based')
      .where('period', period)
      .first();

    if (existing) {
      // Update existing
      await db('prize_configurations')
        .where('id', existing.id)
        .update({
          description: updates.description || existing.description,
          prize_value: updates.prize_value || existing.prize_value,
          enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
          updated_at: new Date()
        });
    } else {
      // Create new
      await db('prize_configurations').insert({
        period,
        period_order: validPeriods.indexOf(period),
        type: 'time-based',
        description: updates.description || `Highest score wins for ${period} period`,
        prize_value: updates.prize_value || '',
        min_score: null,
        enabled: updates.enabled !== undefined ? updates.enabled : true,
        created_at: new Date()
      });
    }

    return this.getTimeBasedPrizes();
  }

  // Update threshold prize
  async updateThresholdPrize(updates) {
    const existing = await db('prize_configurations')
      .where('type', 'threshold')
      .where('period', 'weekly')
      .first();

    if (existing) {
      // Update existing
      await db('prize_configurations')
        .where('id', existing.id)
        .update({
          description: updates.description || existing.description,
          prize_value: updates.prize_value || existing.prize_value,
          min_score: updates.min_score || existing.min_score,
          enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
          updated_at: new Date()
        });
    } else {
      // Create new
      await db('prize_configurations').insert({
        period: 'weekly',
        type: 'threshold',
        description: updates.description || 'Achieve 8,500 points in a single week',
        prize_value: updates.prize_value || 'Sponsor coupon',
        min_score: updates.min_score || this.thresholdAmount,
        enabled: updates.enabled !== undefined ? updates.enabled : true,
        created_at: new Date()
      });
    }

    return this.getThresholdPrize();
  }

  // Get prize winners for a period
  async getPrizeWinners(period = 'weekly', type = 'time-based') {
    if (type === 'time-based') {
      // Get highest scorer for each period instance
      const winners = await db.raw(`
        SELECT DISTINCT ON (l.period_start)
          l.period_start,
          l.period_type,
          l.player_profile_id,
          pp.nickname,
          pp.email,
          pp.real_name,
          l.score,
          l.submitted_at,
          l.rank
        FROM leaderboards l
        JOIN player_profiles pp ON l.player_profile_id = pp.id
        WHERE l.period_type = ?
          AND l.rank = 1
        ORDER BY l.period_start DESC, l.score DESC, l.submitted_at DESC
        LIMIT 10
      `, [period]);

      return winners.rows;
    } else {
      // Get threshold achievers
      const threshold = await this.getThresholdPrize();
      const winners = await db('leaderboards as l')
        .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
        .where('l.period_type', 'weekly')
        .where('l.score', '>=', threshold.min_score)
        .select(
          'l.period_start',
          'l.player_profile_id',
          'pp.nickname',
          'pp.email',
          'pp.real_name',
          'l.score',
          'l.submitted_at'
        )
        .orderBy('l.submitted_at', 'desc')
        .limit(100);

      return winners;
    }
  }

  // Check if player won a prize
  async checkPrizeEligibility(playerProfileId, score, period = 'weekly') {
    const eligibility = {
      timeBased: false,
      threshold: false,
      prizes: []
    };

    // Check time-based prize (rank #1)
    const rank = await db('leaderboards')
      .where('player_profile_id', playerProfileId)
      .where('period_type', period)
      .where('period_start', db.raw('get_period_start(CURRENT_DATE, ?)', [period]))
      .select('rank')
      .first();

    if (rank && rank.rank === 1) {
      eligibility.timeBased = true;
      eligibility.prizes.push({
        type: 'time-based',
        period,
        description: `${period.charAt(0).toUpperCase() + period.slice(1)} champion`
      });
    }

    // Check threshold prize (only for weekly)
    if (period === 'weekly') {
      const threshold = await this.getThresholdPrize();
      if (score >= threshold.min_score) {
        eligibility.threshold = true;
        eligibility.prizes.push({
          type: 'threshold',
          period: 'weekly',
          description: threshold.description,
          prize: threshold.prize_value
        });
      }
    }

    return eligibility;
  }

  // Record prize claim
  async recordPrizeClaim(playerProfileId, prizeType, period) {
    const periodStart = await db.raw('SELECT get_period_start(CURRENT_DATE, ?) as start', [period]);

    await db('prize_claims').insert({
      player_profile_id: playerProfileId,
      prize_type: prizeType,
      period_type: period,
      period_start: periodStart.rows[0].start,
      claimed_at: new Date()
    });

    return true;
  }

  // Get prize claim history
  async getPrizeClaimHistory(playerProfileId = null) {
    let query = db('prize_claims as pc')
      .join('player_profiles as pp', 'pc.player_profile_id', 'pp.id')
      .select(
        'pc.*',
        'pp.nickname',
        'pp.email',
        'pp.real_name'
      )
      .orderBy('pc.claimed_at', 'desc');

    if (playerProfileId) {
      query = query.where('pc.player_profile_id', playerProfileId);
    }

    return query.limit(100);
  }

  // Get unclaimed prizes
  async getUnclaimedPrizes() {
    // Get all time-based winners
    const timeBasedWinners = await db.raw(`
      SELECT DISTINCT ON (l.period_type, l.period_start)
        l.player_profile_id,
        l.period_type,
        l.period_start,
        pp.nickname,
        pp.email,
        'time-based' as prize_type
      FROM leaderboards l
      JOIN player_profiles pp ON l.player_profile_id = pp.id
      LEFT JOIN prize_claims pc ON
        pc.player_profile_id = l.player_profile_id
        AND pc.period_type = l.period_type
        AND pc.period_start = l.period_start
        AND pc.prize_type = 'time-based'
      WHERE l.rank = 1
        AND pc.id IS NULL
        AND l.period_start >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY l.period_type, l.period_start DESC
    `);

    // Get threshold achievers
    const threshold = await this.getThresholdPrize();
    const thresholdWinners = await db.raw(`
      SELECT DISTINCT ON (l.player_profile_id, l.period_start)
        l.player_profile_id,
        'weekly' as period_type,
        l.period_start,
        pp.nickname,
        pp.email,
        'threshold' as prize_type
      FROM leaderboards l
      JOIN player_profiles pp ON l.player_profile_id = pp.id
      LEFT JOIN prize_claims pc ON
        pc.player_profile_id = l.player_profile_id
        AND pc.period_type = 'weekly'
        AND pc.period_start = l.period_start
        AND pc.prize_type = 'threshold'
      WHERE l.period_type = 'weekly'
        AND l.score >= ?
        AND pc.id IS NULL
        AND l.period_start >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY l.player_profile_id, l.period_start DESC
    `, [threshold.min_score]);

    return {
      timeBased: timeBasedWinners.rows,
      threshold: thresholdWinners.rows
    };
  }
}

module.exports = PrizeService;
