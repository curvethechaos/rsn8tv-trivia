// utils/config.js - Centralized configuration management
require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },

  // Application URLs
  app: {
    baseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
    wsUrl: process.env.APP_WS_URL || `ws://localhost:${process.env.PORT || '3000'}`
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'rsn8tv_trivia',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    // Connection pool settings
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    }
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'rsn8tv:',
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    sessionSecret: process.env.SESSION_SECRET || 'change-this-session-secret',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()) || [
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    credentials: true,
  },

  // External APIs
  apis: {
    triviaApi: {
      baseUrl: process.env.TRIVIA_API_BASE_URL || 'https://the-trivia-api.com/api',
      timeout: parseInt(process.env.API_TIMEOUT || '5000', 10),
    },
    openTdb: {
      baseUrl: process.env.OPENTDB_API_BASE_URL || 'https://opentdb.com/api.php',
      timeout: parseInt(process.env.API_TIMEOUT || '5000', 10),
    },
    profanity: {
      apiKey: process.env.PROFANITY_API_KEY || '',
      endpoint: 'https://api.profanity.dev/v1/check',
      timeout: parseInt(process.env.API_TIMEOUT || '3000', 10),
    }
  },

  // Cache Configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour default
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || '600', 10), // 10 minutes
    questionsCacheTTL: parseInt(process.env.QUESTIONS_CACHE_TTL || '86400', 10), // 24 hours
  },

  // Game Configuration
  game: {
    questionsPerSession: parseInt(process.env.QUESTIONS_PER_SESSION || '30', 10),
    questionsPerRound: 10,
    rounds: 3,
    maxPlayersPerSession: parseInt(process.env.MAX_PLAYERS_PER_SESSION || '5', 10),
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10),
    
    // Time limits for each round (in seconds)
    timeLimits: process.env.QUESTION_TIME_LIMITS?.split(',').map(t => parseInt(t, 10)) || [15, 12, 10],
    
    // Points configuration
    points: {
      round1: { base: 100, timeBonus: 50, penalty: -25 },
      round2: { base: 200, timeBonus: 100, penalty: -50 },
      round3: { base: 300, timeBonus: 150, penalty: -75 },
    },
    
    // Difficulty progression
    difficulty: {
      round1: 'easy',
      round2: 'medium',
      round3: 'hard',
    },
    
    // Bonus multipliers
    bonuses: {
      perfectRound: 1.5,    // 50% bonus for perfect round
      streak3: 1.1,         // 10% bonus for 3 in a row
      streak5: 1.2,         // 20% bonus for 5 in a row
      comeback: 1.3,        // 30% bonus for comeback
      clutch: 1.25,         // 25% bonus for clutch performance
    }
  },

  // WebSocket Configuration
  websocket: {
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
    maxHttpBufferSize: parseInt(process.env.WS_MAX_BUFFER || '1000000', 10), // 1MB
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    maxSessionCreates: parseInt(process.env.RATE_LIMIT_SESSION_CREATE || '10', 10),
    maxScoreSubmits: parseInt(process.env.RATE_LIMIT_SCORE_SUBMIT || '10', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || 'json',
    maxFileSize: parseInt(process.env.LOG_MAX_SIZE || '5242880', 10), // 5MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  }
};

// Validate required configuration
const validateConfig = () => {
  const errors = [];

  // Check required environment variables
  if (!process.env.DB_PASSWORD && config.server.isProduction) {
    errors.push('DB_PASSWORD is required in production');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-secret-in-production') {
    if (config.server.isProduction) {
      errors.push('JWT_SECRET must be set to a secure value in production');
    } else {
      console.warn('WARNING: Using default JWT_SECRET. Change this in production!');
    }
  }

  if (!process.env.PROFANITY_API_KEY && config.server.isProduction) {
    console.warn('WARNING: PROFANITY_API_KEY not set. Profanity filtering will be disabled.');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Validate configuration on module load
try {
  validateConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  if (config.server.isProduction) {
    process.exit(1);
  }
}

module.exports = config;
