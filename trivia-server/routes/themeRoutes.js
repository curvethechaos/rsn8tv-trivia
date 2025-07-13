const express = require('express');
const router = express.Router();

// List all themes
router.get('/', async (req, res, next) => {
  try {
    const themes = await req.app.locals.themeService.getAll();
    res.json(themes);
  } catch (err) {
    next(err);
  }
});

// Get a single theme by ID
router.get('/:id', async (req, res, next) => {
  try {
    const theme = await req.app.locals.themeService.getById(req.params.id);
    if (!theme) return res.status(404).json({ error: 'Theme not found' });
    res.json(theme);
  } catch (err) {
    next(err);
  }
});

// Create a new theme
router.post('/', async (req, res, next) => {
  try {
    const newTheme = await req.app.locals.themeService.create(req.body);
    res.status(201).json(newTheme);
  } catch (err) {
    next(err);
  }
});

// Update an existing theme
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await req.app.locals.themeService.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Theme not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a theme
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await req.app.locals.themeService.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Theme not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
