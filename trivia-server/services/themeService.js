// services/themeService.js - Theme management service
const db = require('../db/connection');

class ThemeService {
  constructor() {
    this.defaultTheme = {
      colors: {
        primary: '#ff6b35',
        secondary: '#f7931e',
        bgDark: '#0a0a0a',
        bgCard: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#b0b0b0',
        success: '#4ade80',
        error: '#ef4444'
      },
      fonts: {
        heading: 'Bebas Neue',
        body: 'Roboto'
      },
      animations: {
        duration: '0.3s',
        easing: 'ease-in-out'
      }
    };
  }

  //
  // ======== CRUD methods for /api/admin/themes ========
  //

  // List all themes
  async getAll() {
    return await db('themes').select('*');
  }

  // Get one theme by ID
  async getById(id) {
    return await db('themes').where({ id }).first();
  }

  // Create a new theme
  async create(data) {
    const [newTheme] = await db('themes').insert(data).returning('*');
    return newTheme;
  }

  // Update an existing theme
  async update(id, data) {
    const [updated] = await db('themes').where({ id }).update(data).returning('*');
    return updated;
  }

  // Delete a theme
  async remove(id) {
    return await db('themes').where({ id }).del();
  }

  //
  // ======== Existing methods ========
  //

  // Get current theme
  async getCurrentTheme() {
    const theme = await db('themes')
      .where('is_active', true)
      .orderBy('created_at', 'desc')
      .first();

    if (!theme) {
      // Return default theme if none exists
      return this.defaultTheme;
    }

    return {
      id: theme.id,
      name: theme.name,
      colors: theme.colors,
      fonts: theme.fonts,
      animations: theme.animations,
      created_at: theme.created_at,
      updated_at: theme.updated_at
    };
  }

  // Update theme
  async updateTheme(themeData, userId) {
    const { colors, fonts, animations, name } = themeData;

    // Deactivate current theme
    await db('themes')
      .where('is_active', true)
      .update({ is_active: false });

    // Create new theme
    const [theme] = await db('themes')
      .insert({
        name: name || 'Custom Theme',
        colors: JSON.stringify(colors || this.defaultTheme.colors),
        fonts: JSON.stringify(fonts || this.defaultTheme.fonts),
        animations: JSON.stringify(animations || this.defaultTheme.animations),
        is_active: true,
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    return {
      id: theme.id,
      name: theme.name,
      colors: JSON.parse(theme.colors),
      fonts: JSON.parse(theme.fonts),
      animations: JSON.parse(theme.animations),
      created_at: theme.created_at,
      updated_at: theme.updated_at
    };
  }

  // Get theme history
  async getThemeHistory(limit = 10) {
    const themes = await db('themes')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return themes.map(theme => ({
      id: theme.id,
      name: theme.name,
      colors: JSON.parse(theme.colors),
      fonts: JSON.parse(theme.fonts),
      animations: JSON.parse(theme.animations),
      is_active: theme.is_active,
      created_by: theme.created_by,
      created_at: theme.created_at
    }));
  }

  // Activate theme
  async activateTheme(themeId) {
    // Deactivate all themes
    await db('themes')
      .update({ is_active: false });

    // Activate selected theme
    const [theme] = await db('themes')
      .where('id', themeId)
      .update({
        is_active: true,
        updated_at: new Date()
      })
      .returning('*');

    if (!theme) {
      throw new Error('Theme not found');
    }

    return {
      id: theme.id,
      name: theme.name,
      colors: JSON.parse(theme.colors),
      fonts: JSON.parse(theme.fonts),
      animations: JSON.parse(theme.animations),
      is_active: theme.is_active
    };
  }

  // Delete theme
  async deleteTheme(themeId) {
    const theme = await db('themes')
      .where('id', themeId)
      .first();

    if (!theme) {
      throw new Error('Theme not found');
    }

    if (theme.is_active) {
      throw new Error('Cannot delete active theme');
    }

    await db('themes')
      .where('id', themeId)
      .delete();

    return true;
  }

  // Export theme as CSS
  async exportThemeAsCSS(themeId) {
    const theme = await db('themes')
      .where('id', themeId)
      .first();

    if (!theme) {
      throw new Error('Theme not found');
    }

    const colors = JSON.parse(theme.colors);
    const fonts = JSON.parse(theme.fonts);
    const animations = JSON.parse(theme.animations);

    const css = `:root {
  /* Colors */
  --primary-color: ${colors.primary};
  --secondary-color: ${colors.secondary};
  --bg-dark: ${colors.bgDark};
  --bg-card: ${colors.bgCard};
  --text-primary: ${colors.textPrimary};
  --text-secondary: ${colors.textSecondary};
  --success: ${colors.success};
  --error: ${colors.error};

  /* Fonts */
  --font-heading: '${fonts.heading}', sans-serif;
  --font-body: '${fonts.body}', sans-serif;

  /* Animations */
  --animation-duration: ${animations.duration};
  --animation-easing: ${animations.easing};
}

/* Apply theme */
body {
  background-color: var(--bg-dark);
  color: var(--text-primary);
  font-family: var(--font-body);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
}

.primary-bg {
  background-color: var(--primary-color);
}

.secondary-bg {
  background-color: var(--secondary-color);
}

.card {
  background-color: var(--bg-card);
}

.text-secondary {
  color: var(--text-secondary);
}

.success {
  color: var(--success);
}

.error {
  color: var(--error);
}

/* Animations */
* {
  transition-duration: var(--animation-duration);
  transition-timing-function: var(--animation-easing);
}`;
    return css;
  }
}

module.exports = ThemeService;
