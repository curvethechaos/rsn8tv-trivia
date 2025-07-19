// routes/themeRoutes.js - Theme management routes
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');

// GET /api/admin/themes/current
router.get('/current', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const themeService = req.app.locals.themeService;

    // Try service first, then database
    let theme;
    if (themeService && themeService.getCurrentTheme) {
      theme = await themeService.getCurrentTheme();
    } else {
      // Fallback to direct database query
      const themeRow = await db('themes')
        .orderBy('updated_at', 'desc')
        .first();
      
      theme = themeRow || null;
    }

    const defaultTheme = {
      colors: {
        primary: '#4ade80',
        secondary: '#22c55e',
        background: '#111827',
        surface: '#1f2937',
        text: '#f3f4f6',
        textSecondary: '#9ca3af',
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b'
      },
      fonts: {
        primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        mono: 'Menlo, Monaco, Consolas, "Courier New", monospace'
      },
      effects: {
        blur: true,
        animations: true,
        particles: false,
        sounds: true
      },
      layout: {
        borderRadius: '8px',
        spacing: 'normal',
        density: 'comfortable'
      }
    };

    res.json({
      success: true,
      data: theme || defaultTheme,
      isDefault: !theme
    });
  } catch (error) {
    console.error('Error fetching theme:', error);
    next(error);
  }
});

// POST /api/admin/themes
router.post('/', [
  body('colors').isObject().withMessage('Colors must be an object'),
  body('fonts').optional().isObject(),
  body('effects').optional().isObject(),
  body('layout').optional().isObject()
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
    const themeService = req.app.locals.themeService;
    const themeData = req.body;

    // Save using service if available
    if (themeService && themeService.updateTheme) {
      const updated = await themeService.updateTheme(themeData, req.user.id);
      return res.json({
        success: true,
        data: updated,
        message: 'Theme saved successfully'
      });
    }

    // Fallback to direct database save
    await db('themes')
      .insert({
        colors: JSON.stringify(themeData.colors || {}),
        fonts: JSON.stringify(themeData.fonts || {}),
        effects: JSON.stringify(themeData.effects || {}),
        layout: JSON.stringify(themeData.layout || {}),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('id')
      .merge({
        colors: JSON.stringify(themeData.colors || {}),
        fonts: JSON.stringify(themeData.fonts || {}),
        effects: JSON.stringify(themeData.effects || {}),
        layout: JSON.stringify(themeData.layout || {}),
        updated_at: new Date()
      });

    // Generate and save CSS
    try {
      const css = generateThemeCSS(themeData);
      const cssPath = path.join('/var/www/html/trivia', 'theme-custom.css');
      await fs.writeFile(cssPath, css);
    } catch (cssError) {
      console.error('Error writing CSS file:', cssError);
      // Don't fail the request if CSS generation fails
    }

    res.json({
      success: true,
      data: themeData,
      message: 'Theme saved successfully'
    });
  } catch (error) {
    console.error('Error saving theme:', error);
    next(error);
  }
});

// GET /api/admin/themes/preview/:type
router.get('/preview/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    const validTypes = ['player', 'host'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid preview type. Must be "player" or "host"'
      });
    }

    // Return preview URL
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
    const previewUrl = `${baseUrl}/trivia/preview.html?type=${type}`;

    res.json({
      success: true,
      data: {
        type,
        url: previewUrl,
        message: 'Load this URL in an iframe for preview'
      }
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    next(error);
  }
});

// POST /api/admin/themes/reset
router.post('/reset', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const themeService = req.app.locals.themeService;

    // Reset using service if available
    if (themeService && themeService.resetTheme) {
      await themeService.resetTheme();
    } else {
      // Fallback to direct database delete
      await db('themes')
        .where('id', '!=', 0) // Delete all themes
        .delete();
    }

    // Remove custom CSS file
    try {
      const cssPath = path.join('/var/www/html/trivia', 'theme-custom.css');
      await fs.unlink(cssPath);
    } catch (e) {
      // File might not exist, that's ok
    }

    res.json({
      success: true,
      message: 'Theme reset to default'
    });
  } catch (error) {
    console.error('Error resetting theme:', error);
    next(error);
  }
});

// Helper function to generate CSS from theme config
function generateThemeCSS(theme) {
  const spacing = theme.layout?.spacing || 'normal';
  const spacingValue = spacing === 'compact' ? '4px' : spacing === 'normal' ? '8px' : '12px';

  return `/* Auto-generated theme CSS - DO NOT EDIT */
/* Generated at: ${new Date().toISOString()} */

:root {
  /* Colors */
  --primary-color: ${theme.colors.primary};
  --secondary-color: ${theme.colors.secondary};
  --background-color: ${theme.colors.background};
  --surface-color: ${theme.colors.surface};
  --text-color: ${theme.colors.text};
  --text-secondary: ${theme.colors.textSecondary};
  --success-color: ${theme.colors.success};
  --error-color: ${theme.colors.error};
  --warning-color: ${theme.colors.warning};

  /* Fonts */
  --font-primary: ${theme.fonts?.primary || 'system-ui, sans-serif'};
  --font-heading: ${theme.fonts?.heading || 'system-ui, sans-serif'};
  --font-mono: ${theme.fonts?.mono || 'monospace'};

  /* Layout */
  --border-radius: ${theme.layout?.borderRadius || '8px'};
  --spacing-unit: ${spacingValue};
}

/* Apply theme colors */
body {
  font-family: var(--font-primary);
  color: var(--text-color);
  background-color: var(--background-color);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  color: var(--text-color);
}

/* Buttons */
.btn-primary {
  background-color: var(--primary-color);
  color: var(--background-color);
}

.btn-secondary {
  background-color: var(--secondary-color);
  color: white;
}

/* Cards and surfaces */
.card, .modal-content, .surface {
  background-color: var(--surface-color);
  border-radius: var(--border-radius);
}

/* Effects */
${theme.effects?.blur ? `
.blur-effect {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}` : ''}

${!theme.effects?.animations ? `
* {
  animation: none !important;
  transition: none !important;
}` : ''}

/* Spacing */
.p-1 { padding: var(--spacing-unit); }
.p-2 { padding: calc(var(--spacing-unit) * 2); }
.p-3 { padding: calc(var(--spacing-unit) * 3); }
.m-1 { margin: var(--spacing-unit); }
.m-2 { margin: calc(var(--spacing-unit) * 2); }
.m-3 { margin: calc(var(--spacing-unit) * 3); }
`;
}

module.exports = router;
