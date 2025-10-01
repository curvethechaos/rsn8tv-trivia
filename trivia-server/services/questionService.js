// services/questionService.js - Complete Question Management Service
const db = require('../db/connection');
const Papa = require('papaparse');
const fs = require('fs').promises;

class QuestionService {
  constructor() {
    this.categories = [
      'General Knowledge',
      'Science & Nature',
      'Sports',
      'Geography',
      'History',
      'Politics',
      'Art',
      'Celebrities',
      'Animals',
      'Vehicles',
      'Entertainment',
      'Entertainment: Books',
      'Entertainment: Film',
      'Entertainment: Music',
      'Entertainment: Television',
      'Entertainment: Video Games',
      'Science: Computers',
      'Science: Mathematics',
      'Mythology'
    ];
  }

  async getQuestions(options = {}) {
    const { page = 1, limit = 50, difficulty, category, search, status } = options;
    const offset = (page - 1) * limit;

    // Build query - use 'questions' table (admin-managed)
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
    if (difficulty && difficulty !== 'all') {
      query = query.where('q.difficulty', difficulty);
    }
    if (category && category !== 'all') {
      query = query.where('q.category', category);
    }
    if (search) {
      query = query.where('q.question', 'ilike', `%${search}%`);
    }
    if (status === 'flagged') {
      query = query.where('q.is_flagged', true);
    } else if (status === 'custom') {
      query = query.where('q.is_custom', true);
    } else if (status === 'active') {
      query = query.where('q.is_flagged', false);
    }

    // Get paginated results
    const questions = await query
      .orderBy('q.id', 'desc')
      .limit(limit)
      .offset(offset);

    // Get counts
    const [totalCount, flaggedCount, customCount] = await Promise.all([
      this.getQuestionCount(options),
      this.getFlaggedCount(),
      this.getCustomCount()
    ]);

    return {
      questions: questions.map(q => ({
        ...q,
        incorrect_answers: typeof q.incorrect_answers === 'string' 
          ? JSON.parse(q.incorrect_answers) 
          : q.incorrect_answers,
        status: q.is_flagged ? 'flagged' : (q.is_custom ? 'custom' : 'active')
      })),
      totalCount: parseInt(totalCount),
      flaggedCount: parseInt(flaggedCount),
      customCount: parseInt(customCount)
    };
  }

  async getQuestionCount(options = {}) {
    let query = db('questions').count('id as count');
    
    if (options.difficulty && options.difficulty !== 'all') {
      query = query.where('difficulty', options.difficulty);
    }
    if (options.category && options.category !== 'all') {
      query = query.where('category', options.category);
    }
    if (options.search) {
      query = query.where('question', 'ilike', `%${options.search}%`);
    }
    if (options.status === 'flagged') {
      query = query.where('is_flagged', true);
    } else if (options.status === 'custom') {
      query = query.where('is_custom', true);
    }
    
    const result = await query;
    return result[0].count;
  }

  async getFlaggedCount() {
    const result = await db('questions').where('is_flagged', true).count('id as count');
    return result[0].count;
  }

  async getCustomCount() {
    const result = await db('questions').where('is_custom', true).count('id as count');
    return result[0].count;
  }

  async getCategories() {
    const result = await db('questions')
      .distinct('category')
      .whereNotNull('category')
      .orderBy('category');
    return result.map(r => r.category);
  }

  async flagQuestion(questionId, userId, reason) {
    const question = await db('questions').where('id', questionId).first();
    if (!question) throw new Error('Question not found');

    await db('questions')
      .where('id', questionId)
      .update({
        is_flagged: !question.is_flagged,
        flag_reason: !question.is_flagged ? reason : null,
        flagged_by: !question.is_flagged ? userId : null,
        flagged_at: !question.is_flagged ? db.fn.now() : null,
        updated_at: db.fn.now()
      });

    return { success: true, is_flagged: !question.is_flagged };
  }

  async updateQuestion(questionId, updates, userId) {
    await db('questions')
      .where('id', questionId)
      .update({
        ...updates,
        updated_by: userId,
        updated_at: db.fn.now()
      });
    return { success: true };
  }

  async exportQuestions(filters = {}) {
    let query = db('questions').select('*');
    
    if (filters.difficulty) query = query.where('difficulty', filters.difficulty);
    if (filters.category) query = query.where('category', filters.category);
    if (filters.status === 'flagged') query = query.where('is_flagged', true);
    
    const questions = await query;
    return questions;
  }

  async importQuestions(csvPath, userId) {
    const fileContent = await fs.readFile(csvPath, 'utf8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
    
    const imported = [];
    for (const row of parsed.data) {
      const inserted = await db('questions').insert({
        question: row.question,
        correct_answer: row.correct_answer,
        incorrect_answers: JSON.stringify([row.incorrect_1, row.incorrect_2, row.incorrect_3].filter(Boolean)),
        category: row.category,
        difficulty: row.difficulty || 'medium',
        is_custom: true,
        created_by: userId,
        created_at: db.fn.now()
      }).returning('id');
      
      imported.push(inserted[0]);
    }
    
    return { success: true, imported: imported.length };
  }
}

module.exports = QuestionService;
