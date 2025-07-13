const logger = require('../utils/logger');

class BaseService {
  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  async logError(error, context = {}) {
    logger.error(`[${this.serviceName}] ${error.message}`, {
      error: error.stack,
      context
    });
    
    // Send to Sentry if configured
    if (process.env.SENTRY_DSN) {
      const Sentry = require('@sentry/node');
      Sentry.captureException(error, { extra: context });
    }
  }

  async withTransaction(knex, callback) {
    const trx = await knex.transaction();
    try {
      const result = await callback(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

module.exports = BaseService;
