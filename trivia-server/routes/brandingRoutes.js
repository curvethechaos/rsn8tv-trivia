const express = require('express');
const router = express.Router();

// List all branding configurations
router.get('/', async (req, res, next) => {
  try {
    const configs = await req.app.locals.brandingService.getAll();
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

// Get one branding config by ID
router.get('/:id', async (req, res, next) => {
  try {
    const config = await req.app.locals.brandingService.getById(req.params.id);
    if (!config) return res.status(404).json({ error: 'Branding config not found' });
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// Create a branding config
router.post('/', async (req, res, next) => {
  try {
    const created = await req.app.locals.brandingService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Update a branding config
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await req.app.locals.brandingService.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Branding config not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a branding config
router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await req.app.locals.brandingService.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Branding config not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
