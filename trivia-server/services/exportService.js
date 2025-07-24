const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-writer').createObjectCsvWriter;
const db = require('../db/connection');
const logger = require('../utils/logger');
const exportQueue = require('../queues/exportQueue');

class ExportService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.bucket = process.env.S3_BUCKET || 'rsn8tv-exports-302263084554';
  }

  /**
   * Create a new export request
   */
  async createExport(type, filters, userId) {
    // Insert export record and get the auto-generated ID
    const [exportRecord] = await db('exports')
      .insert({
        user_id: userId,
        type,
        filters: JSON.stringify(filters),
        status: 'pending'
      })
      .returning(['id', 'type', 'status']);
    
    const exportId = exportRecord.id;

    // Determine if we should process synchronously or queue
    const estimatedRows = await this.estimateRowCount(type, filters);
    
    if (estimatedRows < 1000) {
      // Process immediately for small exports
      await this.processExport(exportId);
    } else {
      // Queue for large exports
      await exportQueue.add({ exportId }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });
    }

    return exportId;
  }

  /**
   * Process an export
   */
  async processExport(exportId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .first();

    if (!exportRecord) {
      throw new Error(`Export ${exportId} not found`);
    }

    try {
      // Update status to processing
      await db('exports')
        .where('id', exportId)
        .update({ 
          status: 'processing',
          updated_at: db.fn.now()
        });

      // Get data based on type
      const data = await this.fetchExportData(
        exportRecord.type, 
        typeof exportRecord.filters === "string" ? JSON.parse(exportRecord.filters) : exportRecord.filters
      );

      // Generate CSV file
      const filePath = await this.generateCSV(exportId, exportRecord.type, data);

      // Upload to S3
      const fileUrl = await this.uploadToS3(exportId, exportRecord.type, filePath);

      // Get file stats
      const stats = await fs.stat(filePath);

      // Update export record
      await db('exports')
        .where('id', exportId)
        .update({
          status: 'completed',
          file_url: fileUrl,
          file_path: fileUrl, // Keep both for compatibility
          file_size: stats.size,
          row_count: data.length,
          completed_at: db.fn.now(),
          updated_at: db.fn.now()
        });

      // Clean up local file
      await fs.unlink(filePath);

      logger.info(`Export ${exportId} completed successfully`);

    } catch (error) {
      logger.error(`Export ${exportId} failed:`, error);
      
      await db('exports')
        .where('id', exportId)
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: db.fn.now()
        });

      throw error;
    }
  }

  /**
   * Estimate row count for an export
   */
  async estimateRowCount(type, filters) {
    let query;

    switch (type) {
      case 'players':
        query = db('player_profiles');
        if (filters.registered_only) {
          query = query.whereNotNull('email');
        }
        if (filters.marketing_consent) {
          query = query.where('marketing_consent', true);
        }
        break;

      case 'leaderboards':
        query = db('leaderboards');
        if (filters.period) {
          query = query.where('period_type', filters.period);
        }
        if (filters.period_start) {
          query = query.where('period_start', filters.period_start);
        }
        break;

      case 'questions':
        query = db('questions');
        if (filters.difficulty) {
          query = query.where('difficulty', filters.difficulty);
        }
        if (filters.category) {
          query = query.where('category', filters.category);
        }
        if (filters.status) {
          query = query.where('status', filters.status);
        }
        break;

      case 'marketing_list':
        query = db('player_profiles')
          .where('marketing_consent', true)
          .whereNotNull('email');
        break;

      case 'prize_winners':
        // This table might not exist yet, so handle gracefully
        const tableExists = await db.schema.hasTable('prize_winners');
        if (!tableExists) {
          return 0;
        }
        query = db('prize_winners');
        if (filters.period) {
          query = query.where('period_type', filters.period);
        }
        if (filters.claimed !== undefined) {
          query = query.where('claimed', filters.claimed);
        }
        break;

      default:
        return 0;
    }

    const result = await query.count('* as count').first();
    return parseInt(result.count);
  }

  /**
   * Fetch data for export
   */
  async fetchExportData(type, filters) {
    switch (type) {
      case 'players':
        return this.fetchPlayers(filters);
      case 'leaderboards':
        return this.fetchLeaderboards(filters);
      case 'questions':
        return this.fetchQuestions(filters);
      case 'marketing_list':
        return this.fetchMarketingList(filters);
      case 'prize_winners':
        return this.fetchPrizeWinners(filters);
      default:
        throw new Error(`Unknown export type: ${type}`);
    }
  }

  async fetchPlayers(filters) {
    let query = db('player_profiles as pp')
      .leftJoin('scores as s', 'pp.id', 's.player_profile_id')
      .select(
        'pp.id',
        'pp.email',
        'pp.real_name',
        'pp.nickname',
        'pp.marketing_consent',
        'pp.created_at',
        db.raw('COUNT(DISTINCT s.session_id) as games_played'),
        db.raw('MAX(s.score) as highest_score'),
        db.raw('AVG(s.score)::INTEGER as average_score')
      )
      .groupBy('pp.id');

    if (filters.registered_only) {
      query = query.whereNotNull('pp.email');
    }
    if (filters.marketing_consent) {
      query = query.where('pp.marketing_consent', true);
    }
    if (filters.created_after) {
      query = query.where('pp.created_at', '>=', filters.created_after);
    }
    if (filters.created_before) {
      query = query.where('pp.created_at', '<=', filters.created_before);
    }

    return query;
  }

  async fetchLeaderboards(filters) {
    let query = db('leaderboards as l')
      .join('player_profiles as pp', 'l.player_profile_id', 'pp.id')
      .select(
        'l.rank',
        'pp.nickname',
        'pp.email',
        'l.score',
        'l.period_type',
        'l.period_start',
        'l.submitted_at'
      )
      .orderBy(['l.period_type', 'l.period_start', 'l.rank']);

    if (filters.period) {
      query = query.where('l.period_type', filters.period);
    }
    if (filters.period_start) {
      query = query.where('l.period_start', filters.period_start);
    }
    if (filters.top_n) {
      query = query.where('l.rank', '<=', filters.top_n);
    }

    return query;
  }

  async fetchQuestions(filters) {
    let query = db('questions')
      .select(
        'id',
        'question',
        'correct_answer',
        'incorrect_answers',
        'category',
        'difficulty',
        'times_used',
        'success_rate',
        'status',
        'created_at'
      );

    if (filters.difficulty) {
      query = query.where('difficulty', filters.difficulty);
    }
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.status) {
      query = query.where('status', filters.status);
    }
    if (filters.search) {
      query = query.where('question', 'ILIKE', `%${filters.search}%`);
    }

    return query;
  }

  async fetchMarketingList(filters) {
    let query = db('player_profiles')
      .select(
        'email',
        'real_name',
        'nickname',
        'created_at',
        db.raw(`CASE WHEN last_played > NOW() - INTERVAL '30 days' 
                THEN 'active' ELSE 'inactive' END as status`)
      )
      .where('marketing_consent', true)
      .whereNotNull('email');

    if (filters.active_only) {
      query = query.where('last_played', '>', db.raw("NOW() - INTERVAL '30 days'"));
    }

    return query;
  }

  async fetchPrizeWinners(filters) {
    // Check if prize_winners table exists
    const tableExists = await db.schema.hasTable('prize_winners');
    if (!tableExists) {
      return [];
    }

    let query = db('prize_winners as pw')
      .join('player_profiles as pp', 'pw.player_profile_id', 'pp.id')
      .leftJoin('prizes as p', 'pw.prize_id', 'p.id')
      .select(
        'pp.email',
        'pp.real_name',
        'pp.nickname',
        'pw.period_type',
        'pw.period_start',
        'pw.score',
        'pw.prize_type',
        'p.name as prize_name',
        'p.description as prize_description',
        'pw.claimed',
        'pw.claimed_at',
        'pw.created_at'
      );

    if (filters.period) {
      query = query.where('pw.period_type', filters.period);
    }
    if (filters.claimed !== undefined) {
      query = query.where('pw.claimed', filters.claimed);
    }
    if (filters.date_from) {
      query = query.where('pw.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query = query.where('pw.created_at', '<=', filters.date_to);
    }

    return query;
  }

  /**
   * Generate CSV file
   */
  async generateCSV(exportId, type, data) {
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const filePath = path.join(tempDir, `${exportId}.csv`);
    
    // Define headers based on type
    const headers = this.getCSVHeaders(type);
    
    const csvWriter = csv({
      path: filePath,
      header: headers
    });

    // Transform data if needed
    const records = data.map(row => {
      if (type === 'questions' && row.incorrect_answers) {
        row.incorrect_answers = JSON.stringify(row.incorrect_answers);
      }
      return row;
    });

    await csvWriter.writeRecords(records);
    return filePath;
  }

  getCSVHeaders(type) {
    const headerMappings = {
      players: [
        { id: 'id', title: 'Player ID' },
        { id: 'email', title: 'Email' },
        { id: 'real_name', title: 'Real Name' },
        { id: 'nickname', title: 'Nickname' },
        { id: 'marketing_consent', title: 'Marketing Consent' },
        { id: 'games_played', title: 'Games Played' },
        { id: 'highest_score', title: 'Highest Score' },
        { id: 'average_score', title: 'Average Score' },
        { id: 'created_at', title: 'Joined Date' }
      ],
      leaderboards: [
        { id: 'rank', title: 'Rank' },
        { id: 'nickname', title: 'Nickname' },
        { id: 'email', title: 'Email' },
        { id: 'score', title: 'Score' },
        { id: 'period_type', title: 'Period' },
        { id: 'period_start', title: 'Period Start' },
        { id: 'submitted_at', title: 'Submitted At' }
      ],
      questions: [
        { id: 'id', title: 'Question ID' },
        { id: 'question', title: 'Question' },
        { id: 'correct_answer', title: 'Correct Answer' },
        { id: 'incorrect_answers', title: 'Incorrect Answers (JSON)' },
        { id: 'category', title: 'Category' },
        { id: 'difficulty', title: 'Difficulty' },
        { id: 'times_used', title: 'Times Used' },
        { id: 'success_rate', title: 'Success Rate' },
        { id: 'status', title: 'Status' },
        { id: 'created_at', title: 'Created Date' }
      ],
      marketing_list: [
        { id: 'email', title: 'Email' },
        { id: 'real_name', title: 'Real Name' },
        { id: 'nickname', title: 'Nickname' },
        { id: 'status', title: 'Status' },
        { id: 'created_at', title: 'Joined Date' }
      ],
      prize_winners: [
        { id: 'email', title: 'Email' },
        { id: 'real_name', title: 'Real Name' },
        { id: 'nickname', title: 'Nickname' },
        { id: 'period_type', title: 'Period Type' },
        { id: 'period_start', title: 'Period Start' },
        { id: 'score', title: 'Winning Score' },
        { id: 'prize_type', title: 'Prize Type' },
        { id: 'prize_name', title: 'Prize Name' },
        { id: 'prize_description', title: 'Prize Description' },
        { id: 'claimed', title: 'Claimed' },
        { id: 'claimed_at', title: 'Claimed Date' },
        { id: 'created_at', title: 'Won Date' }
      ]
    };

    return headerMappings[type] || [];
  }

  /**
   * Upload file to S3
   */
  async uploadToS3(exportId, type, filePath) {
    const fileContent = await fs.readFile(filePath);
    const fileName = `exports/${type}/${exportId}.csv`;

    const params = {
      Bucket: this.bucket,
      Key: fileName,
      Body: fileContent,
      ContentType: 'text/csv',
      ContentDisposition: `attachment; filename="${type}-export-${new Date().toISOString().split('T')[0]}.csv"`
    };

    const result = await this.s3.upload(params).promise();
    return result.Location;
  }

  /**
   * Get export status
   */
  async getExportStatus(exportId) {
    return db('exports')
      .where('id', exportId)
      .first();
  }

  /**
   * List exports for a user
   */
  async listExports(userId, limit = 50) {
    return db('exports')
      .select(
        'id',
        'type',
        'status',
        'filters',
        'file_url',
        'file_size',
        'row_count',
        'error_message',
        'created_at',
        'completed_at'
      )
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  /**
   * Generate signed download URL
   */
  async getDownloadUrl(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('user_id', userId)
      .first();

    if (!exportRecord || exportRecord.status !== 'completed') {
      return null;
    }

    // Generate a signed URL valid for 1 hour
    const key = exportRecord.file_url.split('.com/')[1];
    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: 3600 // 1 hour
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  /**
   * Delete an export
   */
  async deleteExport(exportId, userId) {
    const exportRecord = await db('exports')
      .where('id', exportId)
      .where('user_id', userId)
      .first();

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    // Delete from S3 if file exists
    if (exportRecord.file_url) {
      const key = exportRecord.file_url.split('.com/')[1];
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();
    }

    // Delete from database
    await db('exports')
      .where('id', exportId)
      .delete();

    return true;
  }
}

module.exports = new ExportService();
