// services/questionService.js - Question management service using questions table
const db = require('../db/connection');
const Papa = require('papaparse');

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

    // Build query with statistics
    let query = db('question_cache as q')
      .leftJoin(
        db('question_responses')
          .select('question_id')
          .count('* as times_used')
          .select(db.raw('sum(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_count'))
          .groupBy('question_id')
          .as('stats'),
        'q.id', 'stats.question_id'
      )
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
          : q.incorrect_answers
      })),
      totalCount,
      flaggedCount,
      customCount
    };
  }

  // Get single question by ID
  async getById(id) {
    const question = await db('question_cache')
      .where('id', id)
      .first();

    if (question && typeof question.incorrect_answers === 'string') {
      question.incorrect_answers = JSON.parse(question.incorrect_answers);
    }

    return question;
  }

  // Create new question
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

    const [created] = await db('question_cache')
      .insert({
        question,
        correct_answer,
        incorrect_answers: JSON.stringify(incorrectAnswersArray),
        category,
        difficulty,
        is_custom: true,
        created_by,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    created.incorrect_answers = incorrectAnswersArray;
    return created;
  }

  // Update existing question
  async update(id, data) {
    const updateData = {
      updated_at: new Date()
    };

    // Map fields that can be updated
    if (data.question) updateData.question = data.question;
    if (data.correct_answer) updateData.correct_answer = data.correct_answer;
    if (data.category) updateData.category = data.category;
    if (data.difficulty) updateData.difficulty = data.difficulty;
    if (data.updated_by) updateData.updated_by = data.updated_by;

    // Handle incorrect_answers
    if (data.incorrect_answers) {
      updateData.incorrect_answers = JSON.stringify(
        Array.isArray(data.incorrect_answers)
          ? data.incorrect_answers
          : [data.incorrect_answers]
      );
    }

    const [updated] = await db('question_cache')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (updated && typeof updated.incorrect_answers === 'string') {
      updated.incorrect_answers = JSON.parse(updated.incorrect_answers);
    }

    return updated;
  }

  // Delete question (soft delete - we don't actually have is_deleted column, so just return)
  async remove(id) {
    // Since there's no is_deleted column, we'll just flag it
    const [removed] = await db('question_cache')
      .where('id', id)
      .update({
        is_flagged: true,
        flagged_at: new Date()
      })
      .returning('*');

    return removed;
  }

  // Flag or unflag a question
  async flagQuestion(id, userId, reason = null) {
    const question = await this.getById(id);
    if (!question) return null;

    const updateData = {
      is_flagged: !question.is_flagged,
      flag_reason: !question.is_flagged ? reason : null,
      flagged_by: !question.is_flagged ? userId : null,
      flagged_at: !question.is_flagged ? new Date() : null
    };

    const [updated] = await db('question_cache')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (updated && typeof updated.incorrect_answers === 'string') {
      updated.incorrect_answers = JSON.parse(updated.incorrect_answers);
    }

    return updated;
  }

  // Import questions from CSV
  async importQuestions(file) {
    const csvContent = file.buffer.toString('utf-8');

    // Parse CSV
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing failed: ${parseResult.errors[0].message}`);
    }

    const errors = [];
    let imported = 0;

    // Process each row
    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];

      try {
        // Validate required fields
        if (!row.question || !row.correct_answer || !row.category || !row.difficulty) {
          errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        // Parse incorrect answers
        const incorrectAnswers = [];
        if (row.incorrect_answer_1) incorrectAnswers.push(row.incorrect_answer_1.trim());
        if (row.incorrect_answer_2) incorrectAnswers.push(row.incorrect_answer_2.trim());
        if (row.incorrect_answer_3) incorrectAnswers.push(row.incorrect_answer_3.trim());

        if (incorrectAnswers.length !== 3) {
          errors.push({ row: i + 2, error: 'Must have exactly 3 incorrect answers' });
          continue;
        }

        // Validate difficulty
        if (!['easy', 'medium', 'hard'].includes(row.difficulty.toLowerCase())) {
          errors.push({ row: i + 2, error: 'Invalid difficulty (must be easy, medium, or hard)' });
          continue;
        }

        // Insert question
        await db('question_cache').insert({
          question: row.question.trim(),
          correct_answer: row.correct_answer.trim(),
          incorrect_answers: JSON.stringify(incorrectAnswers),
          category: row.category.trim(),
          difficulty: row.difficulty.toLowerCase(),
          is_custom: true,
          created_at: new Date(),
          updated_at: new Date()
        });

        imported++;

      } catch (error) {
        errors.push({ row: i + 2, error: error.message });
      }
    }

    return {
      imported,
      errors,
      total: parseResult.data.length
    };
  }

  // Get all categories
  async getCategories() {
    // Query distinct categories from database
    const result = await db('question_cache')
      .distinct('category')
      .whereNotNull('category')
      .orderBy('category');

    return result.map(r => r.category);
  }

  // Get total question count with filters
  async getQuestionCount(filters = {}) {
    let query = db('question_cache');

    if (filters.difficulty && filters.difficulty !== 'all') {
      query = query.where('difficulty', filters.difficulty);
    }
    if (filters.category && filters.category !== 'all') {
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
    const result = await db('question_cache')
      .where('is_flagged', true)
      .count('id as count');
    return parseInt(result[0].count);
  }

  // Get custom question count
  async getCustomCount() {
    const result = await db('question_cache')
      .where('is_custom', true)
      .count('id as count');
    return parseInt(result[0].count);
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
            is_flagged: true,
            flag_reason: reason,
            flagged_by: userId,
            flagged_at: new Date()
          });
        results.flagged.push(id);
      } catch (error) {
        results.failed.push(id);
      }
    }

    return results;
  }

  // Bulk delete questions (soft delete by flagging)
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
            is_flagged: true,
            flagged_at: new Date()
          });
        results.deleted.push(id);
      } catch (error) {
        results.failed.push(id);
      }
    }

    return results;
  }
}

module.exports = new QuestionService();
