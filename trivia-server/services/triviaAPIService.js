// services/triviaAPIService.js - Local database implementation (no external APIs)
const knex = require('../db/connection');
const { questionCache } = require('../utils/cache');
const logger = require('../utils/logger');

class TriviaAPIService {
  constructor() {
    // Question slot configuration with primary and fallback categories
    this.questionSlots = [
      // Easy (Questions 1-6)
      { difficulty: 'easy', categories: ['Entertainment: Television', 'Entertainment: Cartoon & Animations', 'Entertainment: Video Games'] },
      { difficulty: 'easy', categories: ['Entertainment: Music', 'Entertainment: Musicals & Theatres', 'Entertainment: Film'] },
      { difficulty: 'easy', categories: ['Entertainment: Film', 'Entertainment: Books', 'Entertainment: Board Games'] },
      { difficulty: 'easy', categories: ['Sports', 'Celebrities', 'Science: Gadgets'] },
      { difficulty: 'easy', categories: ['Celebrities', 'Entertainment: Television', 'History'] },
      { difficulty: 'easy', categories: ['Animals', 'Science & Nature', 'Geography'] },

      // Medium (Questions 7-8)
      { difficulty: 'medium', categories: ['Geography', 'Mythology', 'Animals'] },
      { difficulty: 'medium', categories: ['History', 'Politics', 'Art'] },

      // Hard (Questions 9-10)
      { difficulty: 'hard', categories: ['Science: Computers', 'Science & Nature', 'Science: Gadgets'] },
      { difficulty: 'hard', categories: ['Mythology', 'Entertainment: Books', 'History'] },
    ];

    // Configuration
    this.config = {
      maxWordCount: 15,        // Default maximum words per question
      preferredWordCount: 13,  // Ideal word count
      minQualityScore: 40,     // Minimum quality score to use
      maxUsageBeforeRotation: 10  // Rotate questions after this many uses
    };
  }

  /**
   * Fetch questions for a session from local database
   * @param {string} sessionId - Session ID
   * @param {number} count - Total questions needed (default: 30)
   * @returns {Promise<Array>} Array of formatted questions
   */
  async fetchQuestions(sessionId, count = 30) {
    try {
      logger.info(`Fetching ${count} questions for session ${sessionId} from local database`);

      // Check if we have enough questions in the database
      const totalCount = await knex('question_cache')
        .where('is_active', true)
        .where('word_count', '<=', this.config.maxWordCount)
        .count('id as count')
        .first();

      if (!totalCount || totalCount.count < count) {
        logger.warn(`Only ${totalCount?.count || 0} short questions available, need ${count}`);
      }

      // Fetch questions using appropriate strategy
      const questions = await this.fetchFromLocalDatabase(count);

      // Store session-question relationships
      await this.storeQuestionsInDB(questions, sessionId);

      // Update usage statistics
      await this.updateUsageStats(questions.map(q => q.id));

      return questions;
    } catch (error) {
      logger.error('Error fetching questions:', error);
      return await this.getFallbackQuestionsFromDB(count);
    }
  }

  /**
   * Fetch questions from local database
   */
  async fetchFromLocalDatabase(totalCount) {
    // For 10-question games, use category slot system
    if (totalCount === 10) {
      return await this.fetchQuestionsWithCategories(totalCount);
    }

    // For other counts, use balanced distribution
    const distribution = this.calculateDistribution(totalCount);
    const allQuestions = [];

    for (const [difficulty, count] of Object.entries(distribution)) {
      const questions = await this.fetchByDifficulty(count, difficulty);
      allQuestions.push(...questions);
    }

    // If we don't have enough, fill with any available questions
    if (allQuestions.length < totalCount) {
      const remaining = totalCount - allQuestions.length;
      const fillQuestions = await this.fetchAnyQuestions(remaining, allQuestions.map(q => q.id));
      allQuestions.push(...fillQuestions);
    }

    return allQuestions;
  }

  /**
   * Fetch questions using the category slot configuration (for 10-question games)
   */
  async fetchQuestionsWithCategories(totalCount) {
    const questions = [];
    const usedIds = [];

    for (let i = 0; i < this.questionSlots.length && questions.length < totalCount; i++) {
      const slot = this.questionSlots[i];
      let questionFetched = false;

      // Try each category in order
      for (const category of slot.categories) {
        if (questionFetched) break;

        const question = await knex('question_cache')
          .where('is_active', true)
          .where('word_count', '<=', this.config.maxWordCount)
          .where('difficulty', slot.difficulty)
          .where('category', category)
          .whereNotIn('id', usedIds)
          .orderBy('quality_score', 'desc')
          .orderBy('times_used', 'asc')
          .orderByRaw('RANDOM()')
          .first();

        if (question) {
          questions.push(this.formatQuestionFromDB(question));
          usedIds.push(question.id);
          questionFetched = true;
          logger.info(`Question ${i + 1}: Found ${slot.difficulty} question from ${category}`);
        }
      }

      // If no category worked, get any question of that difficulty
      if (!questionFetched) {
        const question = await knex('question_cache')
          .where('is_active', true)
          .where('word_count', '<=', this.config.maxWordCount)
          .where('difficulty', slot.difficulty)
          .whereNotIn('id', usedIds)
          .orderBy('quality_score', 'desc')
          .orderBy('times_used', 'asc')
          .orderByRaw('RANDOM()')
          .first();

        if (question) {
          questions.push(this.formatQuestionFromDB(question));
          usedIds.push(question.id);
          logger.info(`Question ${i + 1}: Found ${slot.difficulty} question from any category`);
        }
      }
    }

    return questions;
  }

  /**
   * Fetch questions by difficulty
   */
  async fetchByDifficulty(count, difficulty) {
    const questions = await knex('question_cache')
      .where('is_active', true)
      .where('word_count', '<=', this.config.maxWordCount)
      .where('difficulty', difficulty)
      .where('quality_score', '>=', this.config.minQualityScore)
      .orderBy('times_used', 'asc')  // Prefer less-used questions
      .orderBy('quality_score', 'desc')
      .orderByRaw('RANDOM()')
      .limit(count);

    return questions.map(q => this.formatQuestionFromDB(q));
  }

  /**
   * Fetch any available questions (fallback)
   */
  async fetchAnyQuestions(count, excludeIds = []) {
    const questions = await knex('question_cache')
      .where('is_active', true)
      .whereNotIn('id', excludeIds)
      .orderBy('word_count', 'asc')  // Prefer shorter questions
      .orderBy('quality_score', 'desc')
      .orderBy('times_used', 'asc')
      .limit(count);

    return questions.map(q => this.formatQuestionFromDB(q));
  }

  /**
   * Calculate distribution of difficulties
   */
  calculateDistribution(totalCount) {
    if (totalCount === 30) {
      return { easy: 10, medium: 10, hard: 10 };
    }

    // For other counts: 60% easy, 25% medium, 15% hard
    return {
      easy: Math.ceil(totalCount * 0.6),
      medium: Math.floor(totalCount * 0.25),
      hard: Math.floor(totalCount * 0.15)
    };
  }

  /**
   * Update usage statistics for questions
   */
  async updateUsageStats(questionIds) {
    if (!questionIds || questionIds.length === 0) return;

    await knex('question_cache')
      .whereIn('id', questionIds)
      .increment('times_used', 1)
      .update('last_used', new Date());

    // Check if any questions need rotation
    const overusedQuestions = await knex('question_cache')
      .whereIn('id', questionIds)
      .where('times_used', '>', this.config.maxUsageBeforeRotation)
      .select('id');

    if (overusedQuestions.length > 0) {
      logger.info(`Rotating ${overusedQuestions.length} overused questions`);
      // You could deactivate these temporarily or reduce their quality score
    }
  }

  /**
   * Admin function to refresh question statistics
   */
  async refreshQuestionStats() {
    const stats = await knex('question_cache')
      .select('difficulty', 'category')
      .select(knex.raw('COUNT(*) as total'))
      .select(knex.raw('COUNT(CASE WHEN word_count <= 15 THEN 1 END) as short_questions'))
      .select(knex.raw('AVG(word_count) as avg_words'))
      .select(knex.raw('AVG(quality_score) as avg_quality'))
      .where('is_active', true)
      .groupBy('difficulty', 'category')
      .orderBy('difficulty')
      .orderBy('category');

    logger.info('Question Database Statistics:');
    stats.forEach(stat => {
      logger.info(`${stat.difficulty} - ${stat.category}: ${stat.short_questions}/${stat.total} short (avg: ${Math.round(stat.avg_words)} words)`);
    });

    return stats;
  }

  /**
   * Get session questions from DB (compatibility method)
   */
  async getSessionQuestionsFromDB(sessionId) {
    return null; // Disabled for now
  }

  /**
   * Store questions in database (compatibility method)
   */
  async storeQuestionsInDB(questions, sessionId) {
    const trx = await knex.transaction();

    try {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const round = Math.floor(i / 10) + 1;

        // Only store the session-question relationship
        await trx('session_questions').insert({
          session_id: sessionId,
          question_id: question.id,
          question_order: i,
          round_number: round
        }).onConflict(['session_id', 'question_id']).ignore();
      }

      await trx.commit();
      logger.info(`Linked ${questions.length} questions to session ${sessionId}`);
    } catch (error) {
      await trx.rollback();
      logger.error('Error storing session questions:', error);
    }
  }

  /**
   * Format a question from database format to app format
   */
  formatQuestionFromDB(dbQuestion) {
    let incorrectAnswers = dbQuestion.incorrect_answers;
    if (typeof incorrectAnswers === 'string') {
      try {
        incorrectAnswers = JSON.parse(incorrectAnswers);
      } catch (e) {
        incorrectAnswers = [];
      }
    }

    const allAnswers = this.shuffleArray([dbQuestion.correct_answer, ...incorrectAnswers]);
    const correctAnswerIndex = allAnswers.indexOf(dbQuestion.correct_answer);

    return {
      id: dbQuestion.id,
      api_id: dbQuestion.api_question_id,
      text: dbQuestion.question_text,
      question: dbQuestion.question_text,
      category: dbQuestion.category,
      difficulty: dbQuestion.difficulty,
      correct_answer: dbQuestion.correct_answer,
      incorrect_answers: incorrectAnswers,
      all_answers: allAnswers,
      correctAnswerIndex: correctAnswerIndex,
      source: 'database',
      type: 'multiple',
      word_count: dbQuestion.word_count,
      quality_score: dbQuestion.quality_score,
      tags: typeof dbQuestion.tags === 'string' ? JSON.parse(dbQuestion.tags) : dbQuestion.tags || [],
      regions: typeof dbQuestion.regions === 'string' ? JSON.parse(dbQuestion.regions) : dbQuestion.regions || []
    };
  }

  /**
   * Get fallback questions from the database
   */
  async getFallbackQuestionsFromDB(count) {
    try {
      const questions = await knex('question_cache')
        .where('is_active', true)
        .orderBy('quality_score', 'desc')
        .orderBy('word_count', 'asc')
        .limit(count);

      if (questions.length === 0) {
        logger.error('No questions available in database!');
        return this.getHardcodedFallbackQuestions(count);
      }

      return questions.map(q => this.formatQuestionFromDB(q));
    } catch (error) {
      logger.error('Error getting fallback questions:', error);
      return this.getHardcodedFallbackQuestions(count);
    }
  }

  /**
   * Last resort hardcoded questions
   */
  getHardcodedFallbackQuestions(count) {
    const fallbacks = [
      {
        id: 'fallback_1',
        text: "What is the capital of France?",
        question: "What is the capital of France?",
        category: "Geography",
        difficulty: "easy",
        correct_answer: "Paris",
        incorrect_answers: ["London", "Berlin", "Madrid"],
        all_answers: ["Paris", "London", "Berlin", "Madrid"],
        correctAnswerIndex: 0,
        source: "fallback",
        type: 'multiple',
        word_count: 6,
        quality_score: 100,
        tags: [],
        regions: []
      }
    ];

    // Return as many as we have, repeat if necessary
    const result = [];
    while (result.length < count) {
      result.push(...fallbacks);
    }
    return result.slice(0, count);
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get questions for a specific round (compatibility)
   */
  async getQuestionsForRound(sessionId, roundNumber) {
    return []; // Disabled
  }
}

module.exports = new TriviaAPIService();
