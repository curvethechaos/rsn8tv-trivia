const Queue = require('bull');
const prizeService = require('../services/prizeService');
const logger = require('../utils/logger');

const prizeQueue = new Queue('prizes', {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD
  }
});

// Process prize check jobs
prizeQueue.process('check-winners', async (job) => {
  const { period } = job.data;
  logger.info(`Checking ${period} prize winners`);
  
  try {
    const winners = await prizeService.checkWinners(period);
    
    // Queue notifications for each winner
    for (const winner of winners) {
      await prizeQueue.add('notify-winner', { winnerId: winner.id });
    }
    
    return { period, winnersFound: winners.length };
  } catch (error) {
    logger.error(`Prize check failed for ${period}`, error);
    throw error;
  }
});

// Process winner notifications
prizeQueue.process('notify-winner', async (job) => {
  const { winnerId } = job.data;
  
  try {
    await prizeService.notifyWinner(winnerId);
    return { winnerId, notified: true };
  } catch (error) {
    logger.error(`Failed to notify winner ${winnerId}`, error);
    throw error;
  }
});

// Schedule periodic prize checks
async function schedulePrizeChecks() {
  // Weekly - Every Monday at 12:00 AM
  await prizeQueue.add('check-winners', { period: 'weekly' }, {
    repeat: { cron: '0 0 * * 1' }
  });

  // Monthly - First day of month at 12:00 AM
  await prizeQueue.add('check-winners', { period: 'monthly' }, {
    repeat: { cron: '0 0 1 * *' }
  });

  // Quarterly - First day of quarter at 12:00 AM
  await prizeQueue.add('check-winners', { period: 'quarterly' }, {
    repeat: { cron: '0 0 1 1,4,7,10 *' }
  });

  // Yearly - January 1st at 12:00 AM
  await prizeQueue.add('check-winners', { period: 'yearly' }, {
    repeat: { cron: '0 0 1 1 *' }
  });

  // Daily cleanup of expired prizes
  await prizeQueue.add('expire-unclaimed', {}, {
    repeat: { cron: '0 2 * * *' } // 2 AM daily
  });
}

// Process expired prizes
prizeQueue.process('expire-unclaimed', async (job) => {
  const expired = await prizeService.expireUnclaimed();
  return { expired };
});

// Initialize scheduled jobs
schedulePrizeChecks().catch(console.error);

module.exports = prizeQueue;
