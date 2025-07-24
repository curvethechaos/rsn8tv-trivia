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
// Import Phase 1 route modules
const themeRoutes    = require('./routes/themeRoutes');
const questionRoutes = require('./routes/questionRoutes');
const prizeRoutes    = require('./routes/prizeRoutes');
const brandingRoutes = require('./routes/brandingRoutes');

// Import Phase 1 services

// Initialize Express app and server
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

// Initialize core services
const gameManager = new GameManager(io, db);
const profanityService = new ProfanityService();

// Initialize Phase 1 services
const exportService = require("./services/exportService");
const themeService = require("./services/themeService");
const questionService = require("./services/questionService");
const prizeService = require("./services/prizeService");
const brandingService = require("./services/brandingService");

// Import service wrappers for missing methods
const {
  questionServiceWrapper,
  themeServiceWrapper,
  brandingServiceWrapper,
  prizeServiceWrapper,
  exportServiceWrapper
} = require('./services/serviceWrappers');
// 
// // Extend services with wrapper methods if needed
// Object.assign(questionService, questionServiceWrapper);
// Object.assign(themeService, themeServiceWrapper);
// Object.assign(brandingService, brandingServiceWrapper);
// Object.assign(prizeService, prizeServiceWrapper);
// Object.assign(exportService, exportServiceWrapper);

// Expose services via app.locals
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

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const games = [];
  let totalPlayers = 0;
  let questionsWithIssues = 0;

  if (gameManager && gameManager.games) {
    gameManager.games.forEach((game, sessionId) => {
      const playerCount = game.players ? game.players.size : 0;
      totalPlayers += playerCount;
      games.push({
        sessionId,
        status: game.status || 'unknown',
        playerCount,
        currentRound: game.currentRound || 0,
        createdAt: game.createdAt || null
      });
      if (game.questions && game.questions.length === 0) questionsWithIssues++;
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
      totalPlayers,
      games,
      questionsWithIssues
    }
  });
});

// Route mounts
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/leaderboards', leaderboardRoutes);

// For admin routes, use verifyToken properly
if (authMiddleware.verifyToken) {
  app.use('/api/admin', authMiddleware.verifyToken, adminRoutes);
  app.use('/api/admin/exports', authMiddleware.verifyToken, exportRoutes);
  
  // Phase 1 route mounts
  app.use('/api/admin/themes', authMiddleware.verifyToken, themeRoutes);
  app.use('/api/admin/questions', authMiddleware.verifyToken, questionRoutes);
  app.use('/api/admin/prizes', authMiddleware.verifyToken, prizeRoutes);
  app.use('/api/admin/branding', authMiddleware.verifyToken, brandingRoutes);
} else {
  // Fallback if verifyToken is not available
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/exports', exportRoutes);
  app.use('/api/admin/themes', themeRoutes);
  app.use('/api/admin/questions', questionRoutes);
  app.use('/api/admin/prizes', prizeRoutes);
  app.use('/api/admin/branding', brandingRoutes);
}
// WebSocket authentication
io.use(async (socket, next) => {
  try {
    const { sessionId, role, clientId } = socket.handshake.auth;
    if (!sessionId || !role) return next(new Error('Missing required auth parameters'));
    const session = await db('sessions').where({ id: sessionId, is_active: true }).first();
    if (!session) return next(new Error('Invalid or expired session'));
    socket.sessionId = sessionId;
    socket.role = role;
    socket.clientId = clientId;
    next();
  } catch (err) {
    console.error('Socket auth error:', err);
    next(new Error('Authentication failed'));
  }
});

// WebSocket handlers
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.role} for session ${socket.sessionId})`);
  socket.join(socket.sessionId);
  if (socket.role === 'host') {
    require('./ws/hostHandler')(io, socket, app);
  } else if (socket.role === 'player') {
    require('./ws/playerHandler')(io, socket, app);
  }
  socket.emit('CONNECTED', { socketId: socket.id, sessionId: socket.sessionId, role: socket.role });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Sessions list
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await db("sessions")
      .select("id", "room_code", "created_at", "is_active")
      .orderBy("created_at", "desc")
      .limit(20);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error("Sessions error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch sessions" });
  }
});

// Current games
app.get("/api/admin/current-games", authMiddleware.verifyToken, async (req, res) => {
  try {
    const games = await db("sessions")
      .select("sessions.*", db.raw("COUNT(players.id) as player_count"))
      .leftJoin("players", "sessions.id", "players.session_id")
      .where("sessions.is_active", true)
      .groupBy("sessions.id")
      .orderBy("sessions.created_at", "desc");
    res.json({ success: true, games });
  } catch (error) {
    console.error("Current games error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch current games" });
  }
});

// Players list
app.get("/api/admin/players", authMiddleware.verifyToken, async (req, res) => {
  try {
    const players = await db("player_profiles")
      .select("*")
      .orderBy("created_at", "desc")
      .limit(100);
    res.json({ success: true, players });
  } catch (error) {
    console.error("Players error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch players" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Initialize background queues
try {
  require('./queues/exportQueue');
  console.log('Export queue initialized');
} catch (err) {
  console.log('Export queue not available:', err.message);
}

try {
  require('./queues/prizeQueue');
  console.log('Prize queue initialized');
} catch (err) {
  console.log('Prize queue not available:', err.message);
}

// Route dump helper
app._router.stack
  .filter(layer => layer.route)
  .forEach(layer => {
    const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
    console.log(`${methods.padEnd(6)}  ${layer.route.path}`);
  });

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
  console.log('SIGTERM received, shutting down...');
  server.close(() => console.log('HTTP server closed'));
  try {
    await db.destroy(); console.log('Database closed');
  } catch (err) { console.error('Error closing DB:', err); }
  process.exit(0);
});

module.exports = { app, server, io };
