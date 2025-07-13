// server.js - Main server file with Socket.IO and GameManager initialization
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const config = require('./utils/config');
const db = require('./db/connection');
const GameManager = require('./services/gameManager');
const ProfanityService = require('./services/profanityService');
const profanityMiddleware = require('./middleware/profanityMiddleware');
const triviaAPIService = require('./services/triviaAPIService');

// Import routes
const sessionRoutes = require('./routes/sessionRoutes');
const playerRoutes = require('./routes/playerRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const exportRoutes = require('./routes/exportRoutes');
const authMiddleware = require('./middleware/authMiddleware');

// Import new Phase 1 services
const ExportService = require('./services/exportService');
const ThemeService = require('./services/themeService');
const QuestionService = require('./services/questionService');
const PrizeService = require('./services/prizeService');
const BrandingService = require('./services/brandingService');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.app.corsOrigins || ['https://trivia.rsn8tv.com', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize GameManager
const gameManager = new GameManager(io, db);

// Initialize ProfanityService
const profanityService = new ProfanityService();

// Initialize Phase 1 services
const exportService = new ExportService();
const themeService = new ThemeService();
const questionService = new QuestionService();
const prizeService = new PrizeService();
const brandingService = new BrandingService();

// Store services in app.locals for access in routes
app.locals.db = db;
app.locals.io = io;
app.locals.gameManager = gameManager;
app.locals.profanityService = profanityService;
app.locals.profanityMiddleware = profanityMiddleware(profanityService);
app.locals.triviaAPIService = triviaAPIService;
app.locals.exportService = exportService;
app.locals.themeService = themeService;
app.locals.questionService = questionService;
app.locals.prizeService = prizeService;
app.locals.brandingService = brandingService;

// Middleware
app.use(cors({
  origin: config.app.corsOrigins || ['https://trivia.rsn8tv.com', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply security headers to all routes
app.use(authMiddleware.securityHeaders);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check with detailed game info
app.get('/health', (req, res) => {
  const games = [];
  let totalPlayers = 0;
  let questionsWithIssues = 0;

  // Get game data from GameManager
  if (gameManager && gameManager.games) {
    gameManager.games.forEach((game, sessionId) => {
      const playerCount = game.players ? game.players.size : 0;
      totalPlayers += playerCount;
      
      games.push({
        sessionId: sessionId,
        status: game.status || 'unknown',
        playerCount: playerCount,
        currentRound: game.currentRound || 0,
        createdAt: game.createdAt || null
      });

      // Check for question issues
      if (game.questions && game.questions.length === 0) {
        questionsWithIssues++;
      }
    });
  }

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: db ? 'connected' : 'disconnected',
      socketIO: io ? 'initialized' : 'not initialized',
      gameManager: gameManager ? 'initialized' : 'not initialized',
      cache: 'not configured',
      redis: 'not configured'
    },
    stats: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      hasGameManager: !!gameManager,
      activeGames: games.length,
      totalPlayers: totalPlayers,
      games: games,
      questionsWithIssues: questionsWithIssues
    }
  });
});

// Routes
// Authentication routes - no auth required for these
app.use('/api/auth', authRoutes);

// Public API routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/leaderboards', leaderboardRoutes);

// Protected admin routes - authMiddleware.verifyToken is applied to all
app.use('/api/admin', authMiddleware.verifyToken, adminRoutes);

// Protected export routes (new in Phase 1)
app.use('/api/admin/exports', authMiddleware.verifyToken, exportRoutes);

// WebSocket connection handling
io.use(async (socket, next) => {
  try {
    const { sessionId, role, clientId } = socket.handshake.auth;

    if (!sessionId || !role) {
      return next(new Error('Missing required auth parameters'));
    }

    // Verify session exists
    const session = await db('sessions')
      .where({ id: sessionId, is_active: true })
      .first();

    if (!session) {
      return next(new Error('Invalid or expired session'));
    }

    // Attach session info to socket
    socket.sessionId = sessionId;
    socket.role = role;
    socket.clientId = clientId;

    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    next(new Error('Authentication failed'));
  }
});

// WebSocket event handlers
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.role} for session ${socket.sessionId})`);

  // Join session room
  socket.join(socket.sessionId);

  // Import appropriate handler based on role
  if (socket.role === 'host') {
    require('./ws/hostHandler')(io, socket, app);
  } else if (socket.role === 'player') {
    require('./ws/playerHandler')(io, socket, app);
  }

  // Emit connection success
  socket.emit('CONNECTED', {
    socketId: socket.id,
    sessionId: socket.sessionId,
    role: socket.role
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Initialize background queues (if available)
try {
  require('./queues/exportQueue');
  console.log('Export queue initialized');
} catch (error) {
  console.log('Export queue not available:', error.message);
}

try {
  require('./queues/prizeQueue');
  console.log('Prize queue initialized');
} catch (error) {
  console.log('Prize queue not available:', error.message);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
    🎮 RSN8TV Trivia Server Started
    📍 Port: ${PORT}
    🌐 Environment: ${process.env.NODE_ENV || 'development'}
    🎯 GameManager: Initialized
    🔍 Active Games: ${gameManager.games.size}
    ⏰ Started: ${new Date().toISOString()}
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Close server
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connection
  try {
    await db.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database:', error);
  }

  process.exit(0);
});

module.exports = { app, server, io };
