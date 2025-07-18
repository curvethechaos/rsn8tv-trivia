// services/themeService.js - Theme management service
const db = require('../db/connection');

class ThemeService {
  constructor() {
    this.defaultTheme = {
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
  }

  // Get current theme from themes table
  async getCurrentTheme() {
    const theme = await db('themes')
      .orderBy('updated_at', 'desc')
      .first();

    if (!theme) {
      return this.defaultTheme;
    }

    // Parse JSON fields if they're stored as strings
    return {
      id: theme.id,
      name: theme.name || 'Custom Theme',
      colors: typeof theme.colors === 'string' ? JSON.parse(theme.colors) : theme.colors,
      fonts: typeof theme.fonts === 'string' ? JSON.parse(theme.fonts) : theme.fonts,
      effects: typeof theme.effects === 'string' ? JSON.parse(theme.effects) : theme.effects,
      layout: typeof theme.layout === 'string' ? JSON.parse(theme.layout) : theme.layout,
      created_at: theme.created_at,
      updated_at: theme.updated_at
    };
  }

  // Update theme
  async updateTheme(themeData, userId) {
    const { colors, fonts, effects, layout, name } = themeData;

    // Check if a theme already exists
    const existingTheme = await db('themes').first();

    const themeRecord = {
      name: name || 'Custom Theme',
      colors: JSON.stringify(colors || this.defaultTheme.colors),
      fonts: JSON.stringify(fonts || this.defaultTheme.fonts),
      effects: JSON.stringify(effects || this.defaultTheme.effects),
      layout: JSON.stringify(layout || this.defaultTheme.layout),
      updated_at: new Date()
    };

    let theme;
    if (existingTheme) {
      // Update existing theme
      [theme] = await db('themes')
        .where('id', existingTheme.id)
        .update(themeRecord)
        .returning('*');
    } else {
      // Create new theme
      [theme] = await db('themes')
        .insert({
          ...themeRecord,
          created_at: new Date()
        })
        .returning('*');
    }

    return {
      id: theme.id,
      name: theme.name,
      colors: JSON.parse(theme.colors),
      fonts: JSON.parse(theme.fonts),
      effects: JSON.parse(theme.effects),
      layout: JSON.parse(theme.layout),
      created_at: theme.created_at,
      updated_at: theme.updated_at
    };
  }

  // Reset theme
  async resetTheme() {
    // Delete all themes
    await db('themes').delete();
    return this.defaultTheme;
  }

  // Export theme as CSS
  async exportThemeAsCSS(themeId) {
    let theme;
    
    if (themeId) {
      theme = await db('themes').where('id', themeId).first();
      if (!theme) {
        throw new Error('Theme not found');
      }
      
      // Parse JSON fields
      theme.colors = typeof theme.colors === 'string' ? JSON.parse(theme.colors) : theme.colors;
      theme.fonts = typeof theme.fonts === 'string' ? JSON.parse(theme.fonts) : theme.fonts;
      theme.effects = typeof theme.effects === 'string' ? JSON.parse(theme.effects) : theme.effects;
      theme.layout = typeof theme.layout === 'string' ? JSON.parse(theme.layout) : theme.layout;
    } else {
      theme = await this.getCurrentTheme();
    }

    const spacingMap = {
      'compact': '4px',
      'normal': '8px',
      'comfortable': '12px'
    };

    const spacingValue = spacingMap[theme.layout?.spacing] || '8px';

    return `:root {
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
  --font-primary: ${theme.fonts.primary};
  --font-heading: ${theme.fonts.heading};
  --font-mono: ${theme.fonts.mono};

  /* Layout */
  --border-radius: ${theme.layout.borderRadius};
  --spacing-unit: ${spacingValue};
}

/* Apply theme */
body {
  font-family: var(--font-primary);
  color: var(--text-color);
  background-color: var(--background-color);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  color: var(--text-color);
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
}` : ''}`;
  }
}

module.exports = ThemeService;
