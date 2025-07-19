// services/exportService.js - Export service for generating CSV and other exports
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const csv = require('csv-stringify');
const db = require('../db/connection');

class ExportService {
  constructor() {
    // AWS S3 configuration - optional, will work without it
    try {
      this.s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });
      this.bucket = process.env.S3_BUCKET || 'rsn8tv-exports';
      this.useS3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    } catch (e) {
      console.log('S3 not configured, using local storage');
      this.useS3 = false;
    }
  }

  // Create a new export job - FIXED to use correct column names
  async createExport(type, filters, userId) {
    const exportId = uuidv4();

    // Store export metadata in database with CORRECT column names
    await db('exports').insert({
      user_id: userId,           // Changed from created_by
      export_type: type,         // Changed from type
      export_format: 'csv',
      filters: JSON.stringify(filters),
      status: 'pending',
      created_at: new Date()
    });

    // Process export asynchronously
    setImmediate(() => {
      this.processExport(exportId, type, filters, userId).catch(err => {
        console.error('Export processing error:', err);
      });
    });

    return exportId;
  }

  // Process export asynchronously
  async processExport(exportId, type, filters, userId) {
    try {
      // Update status to processing
      await db('exports')
        .where('user_id', userId)
        .where('export_type', type)
        .whereRaw('created_at >= NOW() - INTERVAL \'1 minute\'')
        .update({
          status: 'processing'
        });

      // Generate export based on type
      let data;
      let filename;

      switch (type) {
        case 'players':
          data = await this.exportPlayers(filters);
          filename = `players_export_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'leaderboard':
          data = await this.exportLeaderboard(filters);
          filename = `leaderboard_${filters.period || 'weekly'}_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'questions':
          data = await this.exportQuestions(filters);
          filename = `questions_export_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'prizes':
          data = await this.exportPrizeWinners(filters);
          filename = `prize_winners_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'analytics':
          data = await this.exportAnalytics(filters);
          filename = `analytics_export_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        default:
          throw new Error('Invalid export type');
      }

      // Convert to CSV
      const csvData = await this.convertToCSV(data);

      // Store file (S3 or local)
      let filePath = '';
      if (this.useS3) {
        const key = `exports/${userId}/${exportId}/${filename}`;
        await this.uploadToS3(key, csvData, 'text/csv');
        filePath = key;
      } else {
        // For now, just store the CSV data in memory
        // In production, you'd save to disk
        filePath = `/tmp/${filename}`;
      }

      // Update export record with CORRECT column names
      await db('exports')
        .where('user_id', userId)
        .where('export_type', type)
        .where('status', 'processing')
        .update({
          status: 'completed',
          file_path: filePath,
          file_size: Buffer.byteLength(csvData),
          row_count: data.length,
          completed_at: new Date()
        });

    } catch (error) {
      console.error('Export processing error:', error);

      // Update status to failed with CORRECT column name
      await db('exports')
        .where('user_id', userId)
        .where('export_type', type)
        .where('status', 'processing')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date()
        });
    }
  }

  // Export players data - FIXED to use scores table
  async exportPlayers(filters) {
    let query = db('player_profiles as pp')
      .leftJoin(
        db('scores')
          .select('player_profile_id')
          .count('* as games_played')
          .max('score as high_score')
          .groupBy('player_profile_id')
          .as('s'),
        'pp.id', 's.player_profile_id'
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

    // Apply filters
    if (filters.hasEmail) {
      query = query.whereNotNull('pp.email');
    }
    if (filters.marketingConsent) {
      query = query.where('pp.marketing_consent', true);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('pp.nickname', 'ilike', `%${filters.search}%`)
          .orWhere('pp.email', 'ilike', `%${filters.search}%`)
          .orWhere('pp.real_name', 'ilike', `%${filters.search}%`);
      });
    }

    const players = await query.orderBy('pp.created_at', 'desc');

    return players.map(player => ({
      'Player ID': player.id,
      'Nickname': player.nickname,
      'Email': player.email || '',
      'Real Name': player.real_name || '',
      'Marketing Consent': player.marketing_consent ? 'Yes' : 'No',
      'Games Played': player.games_played,
      'High Score': player.high_score,
      'Joined Date': new Date(player.created_at).toLocaleDateString()
    }));
  }

  // Export leaderboard data
  async exportLeaderboard(filters) {
    const period = filters.period || 'weekly';

    const leaderboard = await db.raw(`
      SELECT * FROM get_leaderboard(?, ?)
    `, [period, filters.limit || 100]);

    return leaderboard.rows.map((row, index) => ({
      'Rank': index + 1,
      'Player': row.nickname,
      'Total Score': row.total_score,
      'Games Played': row.games_played,
      'Average Score': row.average_score,
      'Period': period.charAt(0).toUpperCase() + period.slice(1)
    }));
  }

  // Export questions data - FIXED to use questions table structure
  async exportQuestions(filters) {
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
        'q.id',
        'q.question',
        'q.category',
        'q.difficulty',
        'q.correct_answer',
        'q.incorrect_answers',
        'q.is_flagged',
        'q.is_custom',
        db.raw('COALESCE(stats.times_used, 0) as times_used'),
        db.raw('CASE WHEN stats.times_used > 0 THEN ROUND((stats.correct_count::numeric / stats.times_used) * 100, 2) ELSE 0 END as success_rate')
      );

    // Apply filters
    if (filters.difficulty) {
      query = query.where('q.difficulty', filters.difficulty);
    }
    if (filters.category) {
      query = query.where('q.category', filters.category);
    }
    if (filters.status === 'flagged') {
      query = query.where('q.is_flagged', true);
    }
    if (filters.status === 'custom') {
      query = query.where('q.is_custom', true);
    }
    if (filters.search) {
      query = query.where('q.question', 'ilike', `%${filters.search}%`);
    }

    const questions = await query.orderBy('q.id');

    return questions.map(q => ({
      'ID': q.id,
      'Question': q.question,
      'Category': q.category,
      'Difficulty': q.difficulty,
      'Correct Answer': q.correct_answer,
      'Incorrect Answers': Array.isArray(q.incorrect_answers) 
        ? q.incorrect_answers.join('|') 
        : q.incorrect_answers,
      'Times Used': q.times_used,
      'Success Rate': q.success_rate + '%',
      'Status': q.is_flagged ? 'Flagged' : (q.is_custom ? 'Custom' : 'Active')
    }));
  }

  // Export prize winners - FIXED to use correct column names
  async exportPrizeWinners(filters) {
    const period = filters.period || 'weekly';
    const type = filters.type || 'time-based';

    if (type === 'time-based') {
      // Get highest scorer for the period
      const winners = await db('leaderboards as l')
        .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
        .where('l.period_type', period)
        .where('l.rank_position', 1)
        .select(
          'pp.nickname',
          'pp.email',
          'pp.real_name',
          'l.total_score',
          'l.period_start',
          'l.submitted_at'
        )
        .orderBy('l.period_start', 'desc');

      return winners.map(winner => ({
        'Period': period.charAt(0).toUpperCase() + period.slice(1),
        'Period Start': new Date(winner.period_start).toLocaleDateString(),
        'Winner': winner.nickname,
        'Real Name': winner.real_name || '',
        'Email': winner.email || '',
        'Score': winner.total_score,
        'Date Achieved': new Date(winner.submitted_at).toLocaleDateString()
      }));
    } else {
      // Get threshold achievers
      const winners = await db('leaderboards as l')
        .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
        .where('l.period_type', 'weekly')
        .where('l.total_score', '>=', 8500)
        .select(
          'pp.nickname',
          'pp.email',
          'pp.real_name',
          'l.total_score',
          'l.period_start',
          'l.submitted_at'
        )
        .orderBy('l.submitted_at', 'desc');

      return winners.map(winner => ({
        'Week Start': new Date(winner.period_start).toLocaleDateString(),
        'Player': winner.nickname,
        'Real Name': winner.real_name || '',
        'Email': winner.email || '',
        'Score': winner.total_score,
        'Achievement Date': new Date(winner.submitted_at).toLocaleDateString()
      }));
    }
  }

  // Export analytics data
  async exportAnalytics(filters) {
    const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = filters.endDate || new Date();

    const analytics = await db('sessions as s')
      .leftJoin(
        db('players')
          .select('session_id')
          .count('* as player_count')
          .groupBy('session_id')
          .as('p'),
        's.id', 'p.session_id'
      )
      .where('s.created_at', '>=', startDate)
      .where('s.created_at', '<=', endDate)
      .select(
        's.id',
        's.room_code',
        's.created_at',
        's.host_id',
        db.raw('COALESCE(p.player_count, 0) as player_count')
      )
      .orderBy('s.created_at', 'desc');

    return analytics.map(session => ({
      'Session ID': session.id,
      'Room Code': session.room_code,
      'Date': new Date(session.created_at).toLocaleDateString(),
      'Time': new Date(session.created_at).toLocaleTimeString(),
      'Host ID': session.host_id,
      'Player Count': session.player_count
    }));
  }

  // Convert data to CSV
  async convertToCSV(data) {
    return new Promise((resolve, reject) => {
      csv(data, { header: true }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
  }

  // Upload to S3 (optional)
  async uploadToS3(key, data, contentType) {
    if (!this.useS3) return;
    
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType
    };

    return this.s3.upload(params).promise();
  }

  // Get export status - FIXED to use correct column names
  async getExportStatus(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('user_id', userId)  // Changed from created_by
      .first();

    return exportRecord;
  }

  // Get export for download - FIXED
  async getExport(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('user_id', userId)  // Changed from created_by
      .where('status', 'completed')
      .first();

    return exportRecord;
  }

  // Get download info
  async getDownloadInfo(exportId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .first();

    if (!exportRecord || !exportRecord.file_path) {
      throw new Error('Export not found or not ready');
    }

    if (this.useS3 && exportRecord.file_path.startsWith('exports/')) {
      // Generate presigned URL
      const url = await this.s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucket,
        Key: exportRecord.file_path,
        Expires: 300 // 5 minutes
      });

      return {
        url,
        filename: exportRecord.file_path.split('/').pop(),
        contentType: 'text/csv'
      };
    } else {
      // Return local file info
      return {
        url: null,
        filename: exportRecord.file_path.split('/').pop(),
        contentType: 'text/csv',
        filePath: exportRecord.file_path
      };
    }
  }

  // List exports for a user - FIXED
  async listExports(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const exports = await db('exports')
      .where('user_id', userId)  // Changed from created_by
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('exports')
      .where('user_id', userId)  // Changed from created_by
      .count('id as count');

    return {
      exports: exports.map(exp => ({
        ...exp,
        filters: exp.filters ? JSON.parse(exp.filters) : {}
      })),
      pagination: {
        page,
        limit,
        total: parseInt(total[0].count),
        pages: Math.ceil(total[0].count / limit)
      }
    };
  }

  // Delete export - FIXED
  async deleteExport(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('user_id', userId)  // Changed from created_by
      .first();

    if (!exportRecord) {
      return false;
    }

    // Delete from S3 if exists
    if (this.useS3 && exportRecord.file_path && exportRecord.file_path.startsWith('exports/')) {
      try {
        await this.s3.deleteObject({
          Bucket: this.bucket,
          Key: exportRecord.file_path
        }).promise();
      } catch (error) {
        console.error('Error deleting from S3:', error);
      }
    }

    // Delete from database
    await db('exports')
      .where('id', exportId)
      .delete();

    return true;
  }
}

module.exports = ExportService;
