// services/questionService.js - Question management service using question_cache table
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
      'Entertainment: Books',
      'Entertainment: Film',
      'Entertainment: Music',
      'Entertainment: Musicals & Theatres',
      'Entertainment: Television',
      'Entertainment: Video Games',
      'Entertainment: Board Games',
      'Entertainment: Comics',
      'Entertainment: Japanese Anime & Manga',
      'Entertainment: Cartoon & Animations',
      'Science: Computers',
      'Science: Mathematics',
      'Science: Gadgets',
      'Mythology'
    ];
  }

  // Get questions with filters and statistics
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

    // Build query with statistics from question_cache
    let query = db('question_cache as q')
      .select(
        'q.id',
        'q.question_text as question',
        'q.category',
        'q.difficulty',
        'q.correct_answer',
        'q.incorrect_answers',
        'q.is_active',
        'q.cached_at as created_at',
        'q.times_used',
        'q.quality_score',
        'q.word_count',
        db.raw('CASE WHEN q.quality_score < 30 THEN true ELSE false END as is_flagged'),
        db.raw('false as is_custom') // question_cache contains imported questions
      );

    // Apply filters
    if (difficulty) {
      query = query.where('q.difficulty', difficulty);
    }
    if (category) {
      query = query.where('q.category', category);
    }
    if (search) {
      query = query.where('q.question_text', 'ilike', `%${search}%`);
    }
    if (status === 'flagged') {
      query = query.where('q.quality_score', '<', 30); // Low quality score = flagged
    } else if (status === 'active') {
      query = query.where('q.is_active', true);
    } else if (status === 'inactive') {
      query = query.where('q.is_active', false);
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
        success_rate: q.times_used > 0 ? 0.65 : 0 // Placeholder success rate
      })),
      totalCount,
      flaggedCount,
      customCount: 0 // All questions in cache are imported, not custom
    };
  }

  // Get single question by ID
  async getById(id) {
    const question = await db('question_cache')
      .select(
        'id',
        'question_text as question',
        'category',
        'difficulty',
        'correct_answer',
        'incorrect_answers',
        'is_active',
        'times_used',
        'quality_score',
        'word_count'
      )
      .where('id', id)
      .first();

    if (question && typeof question.incorrect_answers === 'string') {
      question.incorrect_answers = JSON.parse(question.incorrect_answers);
    }

    return question;
  }

  // Create new question in question_cache
  async create(data) {
    const { 
      question, 
      correct_answer, 
      incorrect_answers, 
      category, 
      difficulty,
      created_by
    } = data;

    // Validate incorrect_answers is an array
    const incorrectAnswersArray = Array.isArray(incorrect_answers) 
      ? incorrect_answers 
      : [incorrect_answers];

    // Generate API question ID for new custom questions
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const apiQuestionId = `custom_${category.replace(/\s+/g, '%20')}_${timestamp}_${randomStr}`;

    // Calculate word count and quality score
    const wordCount = question.split(/\s+/).length;
    const qualityScore = this.calculateQualityScore(question, wordCount);

    const [created] = await db('question_cache')
      .insert({
        api_question_id: apiQuestionId,
        question_text: question,
        correct_answer,
        incorrect_answers: JSON.stringify(incorrectAnswersArray),
        category,
        difficulty,
        word_count: wordCount,
        quality_score: qualityScore,
        is_active: true,
        times_used: 0,
        tags: JSON.stringify([]),
        regions: JSON.stringify(['US']),
        cached_at: new Date()
      })
      .returning('*');

    created.question = created.question_text;
    created.incorrect_answers = incorrectAnswersArray;
    return created;
  }

  // Update existing question
  async update(id, data) {
    const updateData = {};
    
    // Map fields that can be updated
    if (data.question) updateData.question_text = data.question;
    if (data.correct_answer) updateData.correct_answer = data.correct_answer;
    if (data.category) updateData.category = data.category;
    if (data.difficulty) updateData.difficulty = data.difficulty;
    
    // Handle incorrect_answers
    if (data.incorrect_answers) {
      updateData.incorrect_answers = JSON.stringify(
        Array.isArray(data.incorrect_answers) 
          ? data.incorrect_answers 
          : [data.incorrect_answers]
      );
    }

    // Recalculate word count and quality score if question text changed
    if (data.question) {
      updateData.word_count = data.question.split(/\s+/).length;
      updateData.quality_score = this.calculateQualityScore(data.question, updateData.word_count);
    }

    const [updated] = await db('question_cache')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (updated) {
      updated.question = updated.question_text;
      if (typeof updated.incorrect_answers === 'string') {
        updated.incorrect_answers = JSON.parse(updated.incorrect_answers);
      }
    }

    return updated;
  }

  // Delete question (soft delete by setting is_active to false)
  async remove(id) {
    const [removed] = await db('question_cache')
      .where('id', id)
      .update({
        is_active: false
      })
      .returning('*');

    return removed;
  }

  // Flag or unflag a question (by adjusting quality score)
  async flagQuestion(id, userId, reason = null) {
    const question = await this.getById(id);
    if (!question) return null;

    // If flagging, set quality score to 0. If unflagging, restore to calculated value
    const isFlagged = question.quality_score < 30;
    const updateData = {};

    if (!isFlagged) {
      // Flag the question
      updateData.quality_score = 0;
    } else {
      // Unflag - recalculate quality score
      updateData.quality_score = this.calculateQualityScore(question.question, question.word_count);
    }

    const [updated] = await db('question_cache')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (updated) {
      updated.question = updated.question_text;
      if (typeof updated.incorrect_answers === 'string') {
        updated.incorrect_answers = JSON.parse(updated.incorrect_answers);
      }
    }

    return updated;
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
    let imported = 0;

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
          // Handle pipe-separated format
          incorrectAnswers = record.incorrect_answers.split('|').map(a => a.trim());
        } else if (record.incorrect_answer_1) {
          // Handle individual columns format
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

        // Validate category
        if (!this.categories.includes(record.category)) {
          errors.push(`Row ${i + 2}: Invalid category: ${record.category}`);
          continue;
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const apiQuestionId = `import_${record.category.replace(/\s+/g, '%20')}_${timestamp}_${randomStr}`;
        
        const wordCount = record.question.trim().split(/\s+/).length;
        const qualityScore = this.calculateQualityScore(record.question.trim(), wordCount);

        // Insert question
        await db('question_cache').insert({
          api_question_id: apiQuestionId,
          question_text: record.question.trim(),
          correct_answer: record.correct_answer.trim(),
          incorrect_answers: JSON.stringify(incorrectAnswers),
          category: record.category,
          difficulty: record.difficulty.toLowerCase(),
          word_count: wordCount,
          quality_score: qualityScore,
          is_active: true,
          times_used: 0,
          tags: JSON.stringify([]),
          regions: JSON.stringify(['US']),
          cached_at: new Date()
        });

        imported++;
        
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    return {
      imported,
      errors,
      total: records.length
    };
  }

  // Get all categories
  async getCategories() {
    // Return the predefined categories
    // Could also query distinct categories from the database
    return this.categories;
  }

  // Get total question count with filters
  async getQuestionCount(filters = {}) {
    let query = db('question_cache');

    if (filters.difficulty) {
      query = query.where('difficulty', filters.difficulty);
    }
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.search) {
      query = query.where('question_text', 'ilike', `%${filters.search}%`);
    }
    if (filters.status === 'flagged') {
      query = query.where('quality_score', '<', 30);
    } else if (filters.status === 'active') {
      query = query.where('is_active', true);
    } else if (filters.status === 'inactive') {
      query = query.where('is_active', false);
    }

    const result = await query.count('id as count');
    return parseInt(result[0].count);
  }

  // Get flagged question count (low quality score)
  async getFlaggedCount() {
    const result = await db('question_cache')
      .where('quality_score', '<', 30)
      .count('id as count');
    return parseInt(result[0].count);
  }

  // Get custom question count (not applicable for cache, return 0)
  async getCustomCount() {
    // All questions in cache are imported, so custom count is 0
    // If you want to track custom questions, you could check api_question_id pattern
    const result = await db('question_cache')
      .where('api_question_id', 'like', 'custom_%')
      .count('id as count');
    return parseInt(result[0].count);
  }

  // Calculate quality score for a question
  calculateQualityScore(questionText, wordCount) {
    let score = 50; // Base score

    // Word count scoring
    if (wordCount >= 8 && wordCount <= 15) {
      score += 30; // Optimal length
    } else if (wordCount < 5) {
      score -= 20; // Too short
    } else if (wordCount > 20) {
      score -= 10; // Too long
    }

    // Check for question mark
    if (questionText.includes('?')) {
      score += 10;
    }

    // Check for all caps (poor quality)
    if (questionText === questionText.toUpperCase()) {
      score -= 20;
    }

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  // Bulk flag questions
  async bulkFlag(questionIds, userId, reason) {
    const results = {
      flagged: [],
      failed: []
    };

    for (const id of questionIds) {
      try {
        await db('question_cache')
          .where('id', id)
          .update({
            quality_score: 0 // Flag by setting quality score to 0
          });
        results.flagged.push(id);
      } catch (error) {
        results.failed.push(id);
      }
    }

    return results;
  }

  // Bulk delete questions (soft delete)
  async bulkDelete(questionIds) {
    const results = {
      deleted: [],
      failed: []
    };

    for (const id of questionIds) {
      try {
        await db('question_cache')
          .where('id', id)
          .update({
            is_active: false
          });
        results.deleted.push(id);
      } catch (error) {
        results.failed.push(id);
      }
    }

    return results;
  }

  // Get questions for export (without pagination)
  async exportQuestions(filters = {}) {
    let query = db('question_cache')
      .select(
        'id',
        'question_text as question',
        'category',
        'difficulty',
        'correct_answer',
        'incorrect_answers',
        'is_active',
        'times_used',
        'quality_score'
      );

    // Apply filters
    if (filters.difficulty) {
      query = query.where('difficulty', filters.difficulty);
    }
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.status === 'flagged') {
      query = query.where('quality_score', '<', 30);
    } else if (filters.status === 'active') {
      query = query.where('is_active', true);
    } else if (filters.status === 'inactive') {
      query = query.where('is_active', false);
    }

    const questions = await query.orderBy('id', 'desc');

    return questions.map(q => ({
      ...q,
      incorrect_answers: typeof q.incorrect_answers === 'string' 
        ? JSON.parse(q.incorrect_answers) 
        : q.incorrect_answers,
      is_flagged: q.quality_score < 30
    }));
  }

  // Legacy methods for compatibility
  async getAll() {
    const result = await this.getQuestions({ limit: 1000 });
    return result.questions;
  }
}

module.exports = QuestionService;
