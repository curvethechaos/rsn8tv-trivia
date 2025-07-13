exports.seed = async function(knex) {
  // Insert default theme
  const existingTheme = await knex('themes').where('is_active', true).first();
  if (!existingTheme) {
    await knex('themes').insert({
      name: 'Default Theme',
      colors: JSON.stringify({
        primary: '#ff6b35',
        secondary: '#f7931e',
        bgDark: '#0a0a0a',
        bgCard: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#b0b0b0',
        success: '#4ade80',
        error: '#ef4444'
      }),
      fonts: JSON.stringify({
        heading: 'Bebas Neue',
        body: 'Roboto'
      }),
      animations: JSON.stringify({
        duration: '0.3s',
        easing: 'ease-in-out'
      }),
      is_active: true
    });
  }

  // Insert default prize configurations
  const periods = ['weekly', 'monthly', 'quarterly', 'yearly'];
  for (let i = 0; i < periods.length; i++) {
    const existing = await knex('prize_configurations')
      .where('type', 'time-based')
      .where('period', periods[i])
      .first();
    
    if (!existing) {
      await knex('prize_configurations').insert({
        type: 'time-based',
        period: periods[i],
        period_order: i,
        description: `Highest score wins for ${periods[i]} period`,
        enabled: true
      });
    }
  }

  // Insert threshold prize
  const existingThreshold = await knex('prize_configurations')
    .where('type', 'threshold')
    .where('period', 'weekly')
    .first();
  
  if (!existingThreshold) {
    await knex('prize_configurations').insert({
      type: 'threshold',
      period: 'weekly',
      description: 'Achieve 8,500 points in a single week',
      prize_value: 'Sponsor coupon',
      min_score: 8500,
      enabled: true
    });
  }
};
