const express = require('express');
const router = express.Router();

// List all questions
router.get('/', async (req, res, next) => {
  try {
    const questions = await req.app.locals.questionService.getAll();
    res.json(questions);
  } catch (err) {
    next(err);
  }
});

// Get one question by ID
router.get('/:id', async (req, res, next) => {
  try {
    const question = await req.app.locals.questionService.getById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// Create a question
router.post('/', async (req, res, next) => {
  try {
    const created = await req.app.locals.questionService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Update a question
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await req.app.locals.questionService.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Question not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a question
router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await req.app.locals.questionService.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Question not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
