// services/serviceWrappers.js
// Wrapper functions for services that might not have all methods implemented

const db = require('../db/connection');

// Question Service Wrapper
const questionServiceWrapper = {
  async getQuestions(params) {
    const { page = 1, limit = 50, difficulty, category, search, status } = params;
    
    let query = db('questions as q')
      .leftJoin(
        db('question_responses')
          .select('question_id')
          .count('* as times_used')
          .sum(db.raw('CASE WHEN is_correct THEN 1 ELSE 0 END as correct_count'))
          .groupBy('question_id')
          .as('stats'),
        'q.id', 'stats.question_id'
      )
      .select(
        'q.*',
        db.raw('COALESCE(stats.times_used, 0) as times_used'),
        db.raw('CASE WHEN stats.times_used > 0 THEN ROUND((stats.correct_count::numeric / stats.times_used) * 100, 2) ELSE 0 END as success_rate')
      );

    // Apply filters
    if (difficulty) query = query.where('q.difficulty', difficulty);
    if (category) query = query.where('q.category', category);
    if (search) query = query.where('q.question', 'ilike', `%${search}%`);
    if (status === 'flagged') query = query.where('q.is_flagged', true);
    if (status === 'custom') query = query.where('q.is_custom', true);

    // Get counts
    const [totalResult, flaggedResult, customResult] = await Promise.all([
      db('questions').count('id as count'),
      db('questions').where('is_flagged', true).count('id as count'),
      db('questions').where('is_custom', true).count('id as count')
    ]);

    const offset = (page - 1) * limit;
    const questions = await query.orderBy('q.id', 'desc').limit(limit).offset(offset);

    return {
      questions,
      totalCount: parseInt(totalResult[0].count),
      flaggedCount: parseInt(flaggedResult[0].count),
      customCount: parseInt(customResult[0].count)
    };
  },

  async getCategories() {
    const result = await db('questions')
      .distinct('category')
      .whereNotNull('category')
      .orderBy('category');
    return result.map(r => r.category);
  },

  async flagQuestion(questionId, userId, reason) {
    const question = await db('questions').where('id', questionId).first();
    if (!question) return null;

    const [updated] = await db('questions')
      .where('id', questionId)
      .update({
        is_flagged: !question.is_flagged,
        flag_reason: !question.is_flagged ? reason : null,
        flagged_by: !question.is_flagged ? userId : null,
        flagged_at: !question.is_flagged ? new Date() : null
      })
      .returning('*');

    return updated;
  }
};

// Theme Service Wrapper
const themeServiceWrapper = {
  async getCurrentTheme() {
    const theme = await db('themes')
      .orderBy('updated_at', 'desc')
      .first();
    return theme || null;
  },

  async updateTheme(themeData, userId) {
    const [updated] = await db('themes')
      .insert({
        ...themeData,
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('id')
      .merge({
        ...themeData,
        updated_at: new Date()
      })
      .returning('*');
    
    return updated;
  }
};

// Branding Service Wrapper
const brandingServiceWrapper = {
  async getCurrentBranding() {
    const branding = await db('branding_config')
      .orderBy('updated_at', 'desc')
      .first();
    return branding || {};
  }
};

// Prize Service Wrapper
const prizeServiceWrapper = {
  async getTimeBasedPrizes() {
    const prizes = await db('prize_configurations')
      .where('type', 'time_based')
      .select('*');
    
    return {
      weekly: prizes.find(p => p.period === 'weekly') || {},
      monthly: prizes.find(p => p.period === 'monthly') || {},
      quarterly: prizes.find(p => p.period === 'quarterly') || {},
      yearly: prizes.find(p => p.period === 'yearly') || {}
    };
  },

  async getThresholdPrize() {
    const threshold = await db('prize_configurations')
      .where('type', 'threshold')
      .where('period', 'weekly')
      .first();
    
    return threshold || {
      type: 'threshold',
      period: 'weekly',
      min_score: 8500,
      description: 'Achieve 8,500 points in a single week',
      prize_value: 'Sponsor coupons'
    };
  },

  async getPrizeWinners(period, type) {
    if (type === 'threshold') {
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
        ORDER BY l.period_start DESC, l.total_score DESC
        LIMIT 50
      `);
      return result.rows;
    } else {
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
        ORDER BY l.period_start DESC
        LIMIT 10
      `, [period]);
      return result.rows;
    }
  }
};

// Export Service Wrapper
const exportServiceWrapper = {
  async createExport(type, filters, userId) {
    const exportId = Date.now(); // Simple ID generation
    
    await db('exports').insert({
      user_id: userId,
      export_type: type,
      filters: JSON.stringify(filters),
      status: 'pending',
      created_at: new Date()
    });
    
    return exportId;
  },

  async listExports(userId, options) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    
    const [data, countResult] = await Promise.all([
      db('exports')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('exports')
        .where('user_id', userId)
        .count('id as count')
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total: parseInt(countResult[0].count),
        pages: Math.ceil(countResult[0].count / limit)
      }
    };
  }
};

module.exports = {
  questionServiceWrapper,
  themeServiceWrapper,
  brandingServiceWrapper,
  prizeServiceWrapper,
  exportServiceWrapper
};
