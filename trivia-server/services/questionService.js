// services/questionService.js - Question management service
const db = require('../db/connection');
const csvParse = require('csv-parse/sync');

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
      'Mythology'
    ];
  }

  // Get questions with filters
  async getQuestions(options = {}) {
    const { 
      page = 1, 
      limit = 50, 
      difficulty, 
      category, 
      search, 
      status 
    } = options;
    
    const offset = (page - 1) * limit;

    // Build query
    let query = db('questions as q')
      .leftJoin(
        db.raw(`
          (SELECT question_id, 
           COUNT(*) as times_used,
           AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) as success_rate
           FROM question_responses
           GROUP BY question_id) as stats
        `),
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
        'q.created_at',
        db.raw('COALESCE(stats.times_used, 0) as times_used'),
        db.raw('COALESCE(stats.success_rate, 0) as success_rate')
      );

    // Apply filters
    if (difficulty) {
      query = query.where('q.difficulty', difficulty);
    }
    if (category) {
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
      .orderBy('q.id')
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
        success_rate: parseFloat(q.success_rate)
      })),
      totalCount,
      flaggedCount,
      customCount
    };
  }

  // Get total question count with filters
  async getQuestionCount(filters = {}) {
    let query = db('questions');

    if (filters.difficulty) {
      query = query.where('difficulty', filters.difficulty);
    }
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.search) {
      query = query.where('question', 'ilike', `%${filters.search}%`);
    }
    if (filters.status === 'flagged') {
      query = query.where('is_flagged', true);
    } else if (filters.status === 'custom') {
      query = query.where('is_custom', true);
    } else if (filters.status === 'active') {
      query = query.where('is_flagged', false);
    }

    const result = await query.count('id as count');
    return parseInt(result[0].count);
  }

  // Get flagged question count
  async getFlaggedCount() {
    const result = await db('questions')
      .where('is_flagged', true)
      .count('id as count');
    return parseInt(result[0].count);
  }

  // Get custom question count
  async getCustomCount() {
    const result = await db('questions')
      .where('is_custom', true)
      .count('id as count');
    return parseInt(result[0].count);
  }

  // Import questions from CSV
  async importQuestions(file) {
    const csvContent = file.buffer.toString('utf-8');
    
    // Parse CSV
    const records = csvParse.parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    const questions = [];
    const errors = [];

    // Validate and prepare questions
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      try {
        // Validate required fields
        if (!record.question || !record.correct_answer || !record.category || !record.difficulty) {
          errors.push(`Row ${i + 2}: Missing required fields`);
          continue;
        }

        // Parse incorrect answers
        let incorrectAnswers = [];
        if (record.incorrect_answers) {
          incorrectAnswers = record.incorrect_answers.split('|').map(a => a.trim());
        } else if (record.incorrect_answer_1) {
          // Handle alternate format
          incorrectAnswers = [
            record.incorrect_answer_1,
            record.incorrect_answer_2,
            record.incorrect_answer_3
          ].filter(a => a && a.trim());
        }

        if (incorrectAnswers.length !== 3) {
          errors.push(`Row ${i + 2}: Must have exactly 3 incorrect answers`);
          continue;
        }

        // Validate difficulty
        if (!['easy', 'medium', 'hard'].includes(record.difficulty.toLowerCase())) {
          errors.push(`Row ${i + 2}: Invalid difficulty (must be easy, medium, or hard)`);
          continue;
        }

        questions.push({
          question: record.question.trim(),
          correct_answer: record.correct_answer.trim(),
          incorrect_answers: JSON.stringify(incorrectAnswers),
          category: record.category.trim(),
          difficulty: record.difficulty.toLowerCase(),
          is_custom: true,
          created_at: new Date()
        });
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    // Insert valid questions
    let imported = 0;
    if (questions.length > 0) {
      await db('questions').insert(questions);
      imported = questions.length;
    }

    return {
      imported,
      total: records.length,
      errors
    };
  }

  // Flag/unflag question
  async flagQuestion(questionId, userId) {
    const question = await db('questions')
      .where('id', questionId)
      .first();

    if (!question) {
      throw new Error('Question not found');
    }

    const newFlagStatus = !question.is_flagged;

    await db('questions')
      .where('id', questionId)
      .update({
        is_flagged: newFlagStatus,
        flagged_by: newFlagStatus ? userId : null,
        flagged_at: newFlagStatus ? new Date() : null
      });

    return {
      id: questionId,
      is_flagged: newFlagStatus
    };
  }

  // Update question
  async updateQuestion(questionId, updates, userId) {
    const allowedUpdates = [
      'question',
      'correct_answer',
      'incorrect_answers',
      'category',
      'difficulty'
    ];

    // Filter allowed updates
    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    if (updateData.incorrect_answers && Array.isArray(updateData.incorrect_answers)) {
      updateData.incorrect_answers = JSON.stringify(updateData.incorrect_answers);
    }

    updateData.updated_at = new Date();
    updateData.updated_by = userId;

    const [updated] = await db('questions')
      .where('id', questionId)
      .update(updateData)
      .returning('*');

    if (!updated) {
      throw new Error('Question not found');
    }

    return {
      ...updated,
      incorrect_answers: JSON.parse(updated.incorrect_answers)
    };
  }

  // Delete question
  async deleteQuestion(questionId) {
    const deleted = await db('questions')
      .where('id', questionId)
      .where('is_custom', true) // Only allow deletion of custom questions
      .delete();

    if (!deleted) {
      throw new Error('Question not found or cannot be deleted');
    }

    return true;
  }

  // Get question categories
  async getCategories() {
    const categories = await db('questions')
      .distinct('category')
      .orderBy('category');

    return categories.map(c => c.category);
  }

  // Get question statistics
  async getQuestionStats(questionId) {
    const stats = await db('question_responses')
      .where('question_id', questionId)
      .select(
        db.raw('COUNT(*) as total_responses'),
        db.raw('SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_responses'),
        db.raw('AVG(response_time) as avg_response_time')
      )
      .first();

    return {
      times_used: parseInt(stats.total_responses) || 0,
      success_rate: stats.total_responses > 0 
        ? (stats.correct_responses / stats.total_responses) 
        : 0,
      avg_response_time: parseFloat(stats.avg_response_time) || 0
    };
  }

  // Generate CSV template
  generateCSVTemplate() {
    const template = [
      {
        question: 'What is the capital of France?',
        correct_answer: 'Paris',
        incorrect_answers: 'London|Berlin|Madrid',
        category: 'Geography',
        difficulty: 'easy'
      },
      {
        question: 'Which planet is known as the Red Planet?',
        correct_answer: 'Mars',
        incorrect_answers: 'Venus|Jupiter|Saturn',
        category: 'Science & Nature',
        difficulty: 'easy'
      }
    ];

    const headers = Object.keys(template[0]).join(',');
    const rows = template.map(row => 
      Object.values(row).map(val => `"${val}"`).join(',')
    );

    return [headers, ...rows].join('\n');
  }
}

module.exports = QuestionService;
