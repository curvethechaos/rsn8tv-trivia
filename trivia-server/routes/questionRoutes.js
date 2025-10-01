// routes/questionRoutes.js - Complete question management routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const { body, query, param, validationResult } = require('express-validator');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// GET /api/admin/questions
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('difficulty').optional().isIn(['easy', 'medium', 'hard', 'all']),
  query('category').optional().isString(),
  query('status').optional().isIn(['active', 'flagged', 'custom', 'all']),
  query('search').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;
    const { page = 1, limit = 50, difficulty, category, search, status } = req.query;

    // Try service first
    if (questionService && questionService.getQuestions) {
      const result = await questionService.getQuestions({
        page: parseInt(page),
        limit: parseInt(limit),
        difficulty: difficulty === 'all' ? null : difficulty,
        category: category === 'all' ? null : category,
        search,
        status: status === 'all' ? null : status
      });

      return res.json({
        success: true,
        data: result.questions,
        totalCount: result.totalCount,
        flaggedCount: result.flaggedCount,
        customCount: result.customCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.totalCount,
          pages: Math.ceil(result.totalCount / parseInt(limit))
        }
      });
    }

    // Fallback to direct database query
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
    if (status && status !== 'all') {
      if (status === 'flagged') {
        query = query.where('q.is_flagged', true);
      } else if (status === 'custom') {
        query = query.where('q.is_custom', true);
      } else if (status === 'active') {
        query = query.where('q.is_flagged', false);
      }
    }

    // Get total counts
    const [totalResult, flaggedResult, customResult] = await Promise.all([
      db('questions').count('id as count'),
      db('questions').where('is_flagged', true).count('id as count'),
      db('questions').where('is_custom', true).count('id as count')
    ]);

    const totalCount = parseInt(totalResult[0].count);
    const flaggedCount = parseInt(flaggedResult[0].count);
    const customCount = parseInt(customResult[0].count);

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const questions = await query
      .orderBy('q.id', 'desc')
      .limit(parseInt(limit))
      .offset(offset);

    res.json({
      success: true,
      data: questions,
      totalCount,
      flaggedCount,
      customCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    next(error);
  }
});

// GET /api/admin/questions/categories
router.get('/categories', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;

    // Try service first
    if (questionService && questionService.getCategories) {
      const categories = await questionService.getCategories();
      return res.json({
        success: true,
        data: categories
      });
    }

    // Fallback to direct database query
    const result = await db('questions')
      .distinct('category')
      .whereNotNull('category')
      .orderBy('category');

    const categories = result.map(r => r.category);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    next(error);
  }
});
// GET /api/admin/questions/template
router.get('/csv-template', (req, res) => {
  try {
    const templateData = [
      {
        question: 'What is the capital of France?',
        correct_answer: 'Paris',
        incorrect_answer_1: 'London',
        incorrect_answer_2: 'Berlin',
        incorrect_answer_3: 'Madrid',
        category: 'Geography',
        difficulty: 'easy'
      },
      {
        question: 'Who painted the Mona Lisa?',
        correct_answer: 'Leonardo da Vinci',
        incorrect_answer_1: 'Vincent van Gogh',
        incorrect_answer_2: 'Pablo Picasso',
        incorrect_answer_3: 'Michelangelo',
        category: 'Art',
        difficulty: 'medium'
      }
    ];

    const csv = Papa.unparse(templateData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="questions_template.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create template'
    });
  }
});
// GET /api/admin/questions/:id
router.get('/:id', [
  param('id').isInt()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;

    // Try service first
    if (questionService && questionService.getById) {
      const question = await questionService.getById(req.params.id);
      if (!question) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      return res.json({
        success: true,
        data: question
      });
    }

    // Fallback to direct database query
    const question = await db('questions')
      .where('id', req.params.id)
      .first();

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('Error fetching question:', error);
    next(error);
  }
});

// POST /api/admin/questions
router.post('/', [
  body('question').notEmpty().isString().isLength({ max: 500 }),
  body('correct_answer').notEmpty().isString().isLength({ max: 200 }),
  body('incorrect_answers').isArray({ min: 3, max: 3 }),
  body('incorrect_answers.*').isString().isLength({ max: 200 }),
  body('category').notEmpty().isString().isLength({ max: 100 }),
  body('difficulty').isIn(['easy', 'medium', 'hard'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;
    const questionData = {
      ...req.body,
      is_custom: true,
      created_by: req.user?.id,
      created_at: new Date()
    };

    // Try service first
    if (questionService && questionService.create) {
      const created = await questionService.create(questionData);
      return res.status(201).json({
        success: true,
        data: created
      });
    }

    // Fallback to direct database insert
    const [created] = await db('questions')
      .insert(questionData)
      .returning('*');

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Error creating question:', error);
    next(error);
  }
});

// PUT /api/admin/questions/:id
router.put('/:id', [
  param('id').isInt(),
  body('question').optional().isString().isLength({ max: 500 }),
  body('correct_answer').optional().isString().isLength({ max: 200 }),
  body('incorrect_answers').optional().isArray({ min: 3, max: 3 }),
  body('category').optional().isString().isLength({ max: 100 }),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;
    const updateData = {
      ...req.body,
      updated_by: req.user?.id,
      updated_at: new Date()
    };
// Stringify incorrect_answers if it's an array
if (Array.isArray(updateData.incorrect_answers)) {
  updateData.incorrect_answers = JSON.stringify(updateData.incorrect_answers);
}
    // Try service first
    if (questionService && questionService.update) {
      const updated = await questionService.update(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      return res.json({
        success: true,
        data: updated
      });
    }

    // Fallback to direct database update
    const [updated] = await db('questions')
      .where('id', req.params.id)
      .update(updateData)
      .returning('*');

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating question:', error);
    next(error);
  }
});

// DELETE /api/admin/questions/:id
router.delete('/:id', [
  param('id').isInt()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;

    // Try service first
    if (questionService && questionService.remove) {
      const removed = await questionService.remove(req.params.id);
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      return res.status(204).end();
    }

    // Fallback to soft delete
    const result = await db('questions')
      .where('id', req.params.id)
      .update({
        is_deleted: true,
        deleted_at: new Date(),
        deleted_by: req.user?.id
      });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.status(204).end();
  } catch (error) {
    console.error('Error deleting question:', error);
    next(error);
  }
});

// POST /api/admin/questions/:id/flag
router.post('/:id/flag', [
  param('id').isInt(),
  body('reason').optional().isString().isLength({ max: 500 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;
    const { reason } = req.body;

    // Try service first
    if (questionService && questionService.flagQuestion) {
      const result = await questionService.flagQuestion(
        req.params.id,
        req.user?.id,
        reason
      );
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      return res.json({
        success: true,
        data: result
      });
    }

    // Fallback to direct database update
    const question = await db('questions')
      .where('id', req.params.id)
      .first();

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    // Toggle flag status
    const [updated] = await db('questions')
      .where('id', req.params.id)
      .update({
        is_flagged: !question.is_flagged,
        flag_reason: !question.is_flagged ? reason : null,
        flagged_by: !question.is_flagged ? req.user?.id : null,
        flagged_at: !question.is_flagged ? new Date() : null
      })
      .returning('*');

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error flagging question:', error);
    next(error);
  }
});

// POST /api/admin/questions/import
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const db = req.app.locals.db;
    const questionService = req.app.locals.questionService;
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_')
    });

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV parsing failed',
        errors: parseResult.errors
      });
    }

    const questions = [];
    const errors = [];

    // Validate and transform each row
    parseResult.data.forEach((row, index) => {
      try {
        if (!row.question || !row.correct_answer || !row.category || !row.difficulty) {
          errors.push({ row: index + 2, error: 'Missing required fields' });
          return;
        }

        const incorrectAnswers = [];
        if (row.incorrect_answer_1) incorrectAnswers.push(row.incorrect_answer_1);
        if (row.incorrect_answer_2) incorrectAnswers.push(row.incorrect_answer_2);
        if (row.incorrect_answer_3) incorrectAnswers.push(row.incorrect_answer_3);

        if (incorrectAnswers.length !== 3) {
          errors.push({ row: index + 2, error: 'Must have exactly 3 incorrect answers' });
          return;
        }

        questions.push({
          question: row.question.trim(),
          correct_answer: row.correct_answer.trim(),
          incorrect_answers: incorrectAnswers.map(a => a.trim()),
          category: row.category.trim(),
          difficulty: row.difficulty.trim().toLowerCase(),
          is_custom: true,
          created_by: req.user?.id,
          created_at: new Date()
        });
      } catch (e) {
        errors.push({ row: index + 2, error: e.message });
      }
    });

    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid questions found in CSV',
        errors
      });
    }

    // Try service first
    if (questionService && questionService.bulkCreate) {
      const result = await questionService.bulkCreate(questions);
      return res.json({
        success: true,
        data: {
          imported: result.imported || questions.length,
          errors: errors,
          total: parseResult.data.length
        }
      });
    }

    // Fallback to direct database insert
    await db('questions').insert(questions);

    res.json({
      success: true,
      data: {
        imported: questions.length,
        errors: errors,
        total: parseResult.data.length
      }
    });
  } catch (error) {
    console.error('Error importing questions:', error);
    next(error);
  }
});

// GET /api/admin/questions/export
router.get('/export', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { difficulty, category, status } = req.query;

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
      )
      .where('q.is_deleted', false);

    // Apply filters
    if (difficulty && difficulty !== 'all') {
      query = query.where('q.difficulty', difficulty);
    }
    if (category && category !== 'all') {
      query = query.where('q.category', category);
    }
    if (status === 'flagged') {
      query = query.where('q.is_flagged', true);
    } else if (status === 'custom') {
      query = query.where('q.is_custom', true);
    }

    const questions = await query.orderBy('q.id');

    // Transform to CSV format
    const csvData = questions.map(q => ({
      id: q.id,
      question: q.question,
      correct_answer: q.correct_answer,
      incorrect_answer_1: q.incorrect_answers[0] || '',
      incorrect_answer_2: q.incorrect_answers[1] || '',
      incorrect_answer_3: q.incorrect_answers[2] || '',
      category: q.category,
      difficulty: q.difficulty,
      times_used: q.times_used || 0,
      success_rate: q.success_rate || 0,
      is_flagged: q.is_flagged ? 'Yes' : 'No',
      is_custom: q.is_custom ? 'Yes' : 'No'
    }));

    const csv = Papa.unparse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="questions_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting questions:', error);
    next(error);
  }
});

module.exports = router;
