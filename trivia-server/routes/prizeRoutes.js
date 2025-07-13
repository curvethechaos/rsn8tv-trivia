const express = require('express');
const router = express.Router();

// List all prize configurations
router.get('/', async (req, res, next) => {
  try {
    const prizes = await req.app.locals.prizeService.getAll();
    res.json(prizes);
  } catch (err) {
    next(err);
  }
});

// Get one prize by ID
router.get('/:id', async (req, res, next) => {
  try {
    const prize = await req.app.locals.prizeService.getById(req.params.id);
    if (!prize) return res.status(404).json({ error: 'Prize not found' });
    res.json(prize);
  } catch (err) {
    next(err);
  }
});

// Create a new prize
router.post('/', async (req, res, next) => {
  try {
    const created = await req.app.locals.prizeService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Update a prize
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await req.app.locals.prizeService.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Prize not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a prize
router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await req.app.locals.prizeService.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Prize not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
