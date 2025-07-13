const Queue = require('bull');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');

const exportQueue = new Queue('exports', {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD
  }
});

// Process export jobs
exportQueue.process(async (job) => {
  const { exportId } = job.data;
  logger.info(`Processing export ${exportId}`);
  
  try {
    await exportService.processExport(exportId);
    logger.info(`Export ${exportId} completed`);
  } catch (error) {
    logger.error(`Export ${exportId} failed`, error);
    throw error;
  }
});

// Job event handlers
exportQueue.on('completed', (job, result) => {
  logger.info(`Export job ${job.id} completed`);
});

exportQueue.on('failed', (job, err) => {
  logger.error(`Export job ${job.id} failed`, err);
});

exportQueue.on('stalled', (job) => {
  logger.warn(`Export job ${job.id} stalled`);
});

// Clean old jobs
exportQueue.clean(24 * 60 * 60 * 1000); // 24 hours

module.exports = exportQueue;
