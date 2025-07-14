// routes/questionRoutes.js - Complete question management routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csvParse = require('csv-parse/sync');
const { Parser } = require('json2csv');

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

// Get questions with filters, pagination, and statistics
router.get('/', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const { page = 1, limit = 50, difficulty, category, search, status } = req.query;

    const result = await questionService.getQuestions({
      page: parseInt(page),
      limit: parseInt(limit),
      difficulty,
      category,
      search,
      status
    });

    res.json({
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
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

// Get all categories
router.get('/categories', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const categories = await questionService.getCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// Get one question by ID with full details
router.get('/:id', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const question = await questionService.getById(req.params.id);
    
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch question'
    });
  }
});

// Create a new question
router.post('/', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    
    // Validate required fields
    const { question, correct_answer, incorrect_answers, category, difficulty } = req.body;
    
    if (!question || !correct_answer || !incorrect_answers || !category || !difficulty) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Ensure incorrect_answers is an array with 3 items
    if (!Array.isArray(incorrect_answers) || incorrect_answers.length !== 3) {
      return res.status(400).json({
        success: false,
        error: 'Must provide exactly 3 incorrect answers'
      });
    }
    
    const created = await questionService.create({
      ...req.body,
      is_custom: true, // Mark as custom question
      created_by: req.user?.id
    });
    
    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create question'
    });
  }
});

// Update a question
router.put('/:id', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const updated = await questionService.update(req.params.id, {
      ...req.body,
      updated_by: req.user?.id,
      updated_at: new Date()
    });
    
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
    res.status(500).json({
      success: false,
      error: 'Failed to update question'
    });
  }
});

// Delete a question (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const removed = await questionService.remove(req.params.id);
    
    if (!removed) {
      return res.status(404).json({ 
        success: false,
        error: 'Question not found' 
      });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete question'
    });
  }
});

// Flag/unflag a question
router.post('/:id/flag', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const { reason } = req.body;
    
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
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error flagging question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flag question'
    });
  }
});

// Import questions from CSV
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const questionService = req.app.locals.questionService;
    const result = await questionService.importQuestions(req.file);

    res.json({
      success: true,
      data: {
        imported: result.imported,
        errors: result.errors,
        total: result.total
      }
    });
  } catch (error) {
    console.error('Error importing questions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to import questions'
    });
  }
});

// Export questions to CSV
router.get('/export', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const { difficulty, category, status } = req.query;
    
    // Get questions with filters
    const result = await questionService.getQuestions({
      page: 1,
      limit: 10000, // Get all questions
      difficulty,
      category,
      status
    });
    
    // Convert to CSV
    const fields = [
      'id',
      'question',
      'correct_answer',
      'incorrect_answer_1',
      'incorrect_answer_2', 
      'incorrect_answer_3',
      'category',
      'difficulty',
      'times_used',
      'success_rate',
      'is_flagged',
      'is_custom'
    ];
    
    const data = result.questions.map(q => ({
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
    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="questions_export_${Date.now()}.csv"`);
    res.send(csv);
    
  } catch (error) {
    console.error('Error exporting questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export questions'
    });
  }
});

// Download CSV template
router.get('/template', (req, res) => {
  try {
    const fields = [
      'question',
      'correct_answer',
      'incorrect_answer_1',
      'incorrect_answer_2',
      'incorrect_answer_3',
      'category',
      'difficulty'
    ];
    
    const sampleData = [
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
    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(sampleData);
    
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

// Bulk operations
router.post('/bulk/flag', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const { questionIds, reason } = req.body;
    
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No question IDs provided'
      });
    }
    
    const results = await questionService.bulkFlag(questionIds, req.user?.id, reason);
    
    res.json({
      success: true,
      data: {
        flagged: results.flagged,
        failed: results.failed
      }
    });
  } catch (error) {
    console.error('Error bulk flagging questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flag questions'
    });
  }
});

router.delete('/bulk/delete', async (req, res, next) => {
  try {
    const questionService = req.app.locals.questionService;
    const { questionIds } = req.body;
    
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No question IDs provided'
      });
    }
    
    const results = await questionService.bulkDelete(questionIds);
    
    res.json({
      success: true,
      data: {
        deleted: results.deleted,
        failed: results.failed
      }
    });
  } catch (error) {
    console.error('Error bulk deleting questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete questions'
    });
  }
});

module.exports = router;
