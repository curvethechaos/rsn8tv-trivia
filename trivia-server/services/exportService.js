// services/exportService.js - Export service for generating CSV and other exports
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const csv = require('csv-stringify');
const db = require('../db/connection');

class ExportService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.bucket = process.env.S3_BUCKET || 'rsn8tv-exports-302263084554';
  }

  // Create a new export job
  async createExport(type, filters, userId) {
    const exportId = uuidv4();
    
    // Store export metadata in database
    await db('exports').insert({
      id: exportId,
      type,
      filters: JSON.stringify(filters),
      status: 'pending',
      created_by: userId,
      created_at: new Date()
    });

    // Queue the export job
    this.processExport(exportId, type, filters, userId);

    return exportId;
  }

  // Process export asynchronously
  async processExport(exportId, type, filters, userId) {
    try {
      // Update status to processing
      await db('exports')
        .where('id', exportId)
        .update({ 
          status: 'processing',
          started_at: new Date()
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

      // Upload to S3
      const key = `exports/${userId}/${exportId}/${filename}`;
      await this.uploadToS3(key, csvData, 'text/csv');

      // Update export record
      await db('exports')
        .where('id', exportId)
        .update({
          status: 'completed',
          filename,
          s3_key: key,
          file_size: Buffer.byteLength(csvData),
          completed_at: new Date()
        });

    } catch (error) {
      console.error('Export processing error:', error);
      
      // Update status to failed
      await db('exports')
        .where('id', exportId)
        .update({
          status: 'failed',
          error_message: error.message,
          failed_at: new Date()
        });
    }
  }

  // Export players data
  async exportPlayers(filters) {
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

    return leaderboard.rows.map(row => ({
      'Rank': row.rank,
      'Player': row.nickname,
      'Score': row.score,
      'Games Played': row.games_played,
      'Period': period.charAt(0).toUpperCase() + period.slice(1),
      'Date Achieved': new Date(row.submitted_at).toLocaleDateString()
    }));
  }

  // Export questions data
  async exportQuestions(filters) {
    let query = db('questions as q')
      .leftJoin(
        db('question_statistics')
          .select('question_id', 'times_used', 'success_rate')
          .as('qs'),
        'q.id', 'qs.question_id'
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
        db.raw('COALESCE(qs.times_used, 0) as times_used'),
        db.raw('COALESCE(qs.success_rate, 0) as success_rate')
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
      'Incorrect Answers': q.incorrect_answers.join('|'),
      'Times Used': q.times_used,
      'Success Rate': (q.success_rate * 100).toFixed(1) + '%',
      'Status': q.is_flagged ? 'Flagged' : (q.is_custom ? 'Custom' : 'Active')
    }));
  }

  // Export prize winners
  async exportPrizeWinners(filters) {
    const period = filters.period || 'weekly';
    const type = filters.type || 'time-based';

    if (type === 'time-based') {
      // Get highest scorer for the period
      const winners = await db('leaderboards as l')
        .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
        .where('l.period_type', period)
        .where('l.rank', 1)
        .select(
          'pp.nickname',
          'pp.email',
          'pp.real_name',
          'l.score',
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
        'Score': winner.score,
        'Date Achieved': new Date(winner.submitted_at).toLocaleDateString()
      }));
    } else {
      // Get threshold achievers
      const winners = await db('leaderboards as l')
        .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
        .where('l.period_type', 'weekly')
        .where('l.score', '>=', 8500)
        .select(
          'pp.nickname',
          'pp.email',
          'pp.real_name',
          'l.score',
          'l.period_start',
          'l.submitted_at'
        )
        .orderBy('l.submitted_at', 'desc');

      return winners.map(winner => ({
        'Week Start': new Date(winner.period_start).toLocaleDateString(),
        'Player': winner.nickname,
        'Real Name': winner.real_name || '',
        'Email': winner.email || '',
        'Score': winner.score,
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
          .select('session_id', db.raw('COUNT(*) as player_count'))
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

  // Upload to S3
  async uploadToS3(key, data, contentType) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType
    };

    return this.s3.upload(params).promise();
  }

  // Get export status
  async getExportStatus(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('created_by', userId)
      .first();

    return exportRecord;
  }

  // Get export for download
  async getExport(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('created_by', userId)
      .where('status', 'completed')
      .first();

    return exportRecord;
  }

  // Get download info
  async getDownloadInfo(exportId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .first();

    if (!exportRecord || !exportRecord.s3_key) {
      throw new Error('Export not found or not ready');
    }

    // Generate presigned URL
    const url = await this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: exportRecord.s3_key,
      Expires: 300 // 5 minutes
    });

    return {
      url,
      filename: exportRecord.filename,
      contentType: 'text/csv'
    };
  }

  // List exports for a user
  async listExports(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const exports = await db('exports')
      .where('created_by', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('exports')
      .where('created_by', userId)
      .count('id as count');

    return {
      exports,
      pagination: {
        page,
        limit,
        total: parseInt(total[0].count),
        pages: Math.ceil(total[0].count / limit)
      }
    };
  }

  // Delete export
  async deleteExport(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('created_by', userId)
      .first();

    if (!exportRecord) {
      return false;
    }

    // Delete from S3 if exists
    if (exportRecord.s3_key) {
      try {
        await this.s3.deleteObject({
          Bucket: this.bucket,
          Key: exportRecord.s3_key
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
