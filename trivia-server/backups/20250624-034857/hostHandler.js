// ws/hostHandler.js - Complete Host WebSocket handlers with GameManager integration
const logger = require('../utils/logger');

function setupHostHandlers(io, socket, app) {
  const { sessionId, clientId } = socket;
  const gameManager = app.locals.gameManager;
  
  logger.info(`Setting up host handlers for ${socket.id} in session ${sessionId}`);
  
  // Host has connected - game should already exist from session creation
  const game = gameManager.games.get(sessionId);
  if (!game) {
    logger.error(`No game found for session ${sessionId}`);
    socket.emit('error', { message: 'Game session not found' });
    socket.disconnect();
    return;
  }
  
  // Join the session room
  socket.join(sessionId);
  logger.info(`Host ${socket.id} joined room ${sessionId}`);
  
  // Notify that host is connected
  socket.emit('host:connected', {
    sessionId,
    message: 'Connected as host'
  });
  
  // Listen for game control events from host
  socket.on('host:start_game', () => {
    logger.info(`Host requesting to start game for session ${sessionId}`);
    gameManager.startGame(sessionId);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Host ${socket.id} disconnected from session ${sessionId}`);
    // Don't destroy the game, players might still be connected
  });
}

module.exports = setupHostHandlers;
