// utils/cache.js - Simple caching system with in-memory fallback
const NodeCache = require('node-cache');
const config = require('./config');
const logger = require('./logger');

// In-memory cache
const memoryCache = new NodeCache({
  stdTTL: 600, // 10 minutes default
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false,
  deleteOnExpire: true
});

// Unified cache interface
const cache = {
  // Get the cache type being used
  getType() {
    return 'memory';
  },

  // Set a value with optional TTL
  async set(key, value, ttl = 600) {
    try {
      memoryCache.set(key, value, ttl);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  },

  // Get a value
  async get(key) {
    try {
      return memoryCache.get(key) || null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  },

  // Delete a key
  async del(key) {
    try {
      memoryCache.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  },

  // Delete keys by pattern
  async delByPattern(pattern) {
    try {
      const keys = memoryCache.keys();
      const regex = new RegExp(pattern.replace('*', '.*'));
      keys.forEach(key => {
        if (regex.test(key)) {
          memoryCache.del(key);
        }
      });
      return true;
    } catch (error) {
      logger.error(`Cache delete by pattern error for ${pattern}:`, error);
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      return memoryCache.has(key);
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  },

  // Get or set - fetch from cache or source
  async getOrSet(key, fetchFunction, ttl = 600) {
    try {
      const cached = await this.get(key);
      if (cached !== null) {
        logger.debug(`Cache hit for key: ${key}`);
        return cached;
      }

      logger.debug(`Cache miss for key: ${key}`);
      const value = await fetchFunction();
      
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }
      
      return value;
    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      return fetchFunction();
    }
  },

  // Clear all cache
  async flush() {
    try {
      memoryCache.flushAll();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  },

  // Get cache statistics
  getStats() {
    return {
      type: 'memory',
      keys: memoryCache.keys(),
      stats: memoryCache.getStats()
    };
  }
};

// Question caching utilities
const questionCache = {
  // Cache questions fetched from API
  async cacheQuestions(source, difficulty, questions, ttl = 86400) {
    const key = `questions:${source}:${difficulty}`;
    return cache.set(key, questions, ttl);
  },

  // Get cached questions
  async getCachedQuestions(source, difficulty) {
    const key = `questions:${source}:${difficulty}`;
    return cache.get(key);
  },

  // Cache questions for a specific session
  async cacheSessionQuestions(sessionId, questions, ttl = 3600) {
    const key = `session:questions:${sessionId}`;
    return cache.set(key, questions, ttl);
  },

  // Get questions for a specific session
  async getSessionQuestions(sessionId) {
    const key = `session:questions:${sessionId}`;
    return cache.get(key);
  },

  // Clear question cache
  async clearQuestionCache() {
    const keys = memoryCache.keys();
    keys.forEach(key => {
      if (key.startsWith('questions:')) {
        memoryCache.del(key);
      }
    });
  }
};

// Session caching utilities
const sessionCache = {
  // Store active session data
  async setSession(sessionId, data, ttl = 1800) {
    const key = `session:${sessionId}`;
    return cache.set(key, data, ttl);
  },

  // Get session data
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return cache.get(key);
  },

  // Update session data
  async updateSession(sessionId, updates, ttl = 1800) {
    const current = await this.getSession(sessionId) || {};
    const updated = { ...current, ...updates, lastActivity: new Date() };
    return this.setSession(sessionId, updated, ttl);
  },

  // Store player in session
  async addPlayer(sessionId, playerId, playerData, ttl = 1800) {
    const key = `session:players:${sessionId}`;
    const players = await cache.get(key) || {};
    players[playerId] = playerData;
    return cache.set(key, players, ttl);
  },

  // Get all players in session
  async getPlayers(sessionId) {
    const key = `session:players:${sessionId}`;
    return cache.get(key) || {};
  },

  // Remove player from session
  async removePlayer(sessionId, playerId) {
    const key = `session:players:${sessionId}`;
    const players = await cache.get(key) || {};
    delete players[playerId];
    return cache.set(key, players);
  },

  // Clear session data
  async clearSession(sessionId) {
    await cache.del(`session:${sessionId}`);
    await cache.del(`session:players:${sessionId}`);
    await cache.del(`session:questions:${sessionId}`);
  }
};

// Export all utilities
module.exports = {
  cache,
  questionCache,
  sessionCache,
  memoryCache
};
