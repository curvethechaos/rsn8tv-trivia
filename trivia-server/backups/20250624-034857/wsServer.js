// wsServer.js - WebSocket server with GameManager integration
const socketIO = require('socket.io');
const logger = require('../utils/logger');
const GameManager = require('../services/gameManager');
const { validateSession, validatePlayer } = require('../utils/validation');

class WebSocketServer {
  constructor(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 10000,
      pingInterval: 5000
    });
    
    this.gameManager = new GameManager(this.io);
    
    // Set up connection handlers
    this.io.on('connection', (socket) => {
      logger.info(`New WebSocket connection: ${socket.id}`);
      
      // Determine if this is a host or player connection
      const { sessionId, playerId, isHost } = socket.handshake.query;
      
      if (isHost === 'true') {
        this.handleHostConnection(socket, sessionId);
      } else {
        this.handlePlayerConnection(socket, sessionId, playerId);
      }
      
      // Handle disconnect
      socket.on('disconnect', () => {
        this.gameManager.handleDisconnect(socket.id);
      });
    });
  }

  // Handle host (tablet) connections
  handleHostConnection(socket, sessionId) {
    logger.info(`Host attempting to connect to session: ${sessionId}`);
    
    // Validate session exists
    if (!validateSession(sessionId)) {
      socket.emit('error', { message: 'Invalid session' });
      socket.disconnect();
      return;
    }
    
    // Connect host to game
    const game = this.gameManager.connectHost(sessionId, socket.id);
    if (!game) {
      socket.emit('error', { message: 'Session not found' });
      socket.disconnect();
      return;
    }
    
    // Host-specific event handlers
    socket.on('START_GAME', () => {
      logger.info(`Host starting game for session: ${sessionId}`);
      const result = this.gameManager.startGame(sessionId);
      
      if (result.error) {
        socket.emit('error', { message: result.error });
      }
    });
    
    socket.on('PAUSE_GAME', () => {
      // Optional: Implement pause functionality
      logger.info(`Host pausing game for session: ${sessionId}`);
    });
    
    socket.on('END_GAME', () => {
      logger.info(`Host ending game for session: ${sessionId}`);
      this.gameManager.endGame(sessionId);
    });
    
    socket.on('GET_GAME_STATE', () => {
      const state = this.gameManager.getGameState(sessionId);
      socket.emit('GAME_STATE', state);
    });
  }

  // Handle player (mobile) connections
  handlePlayerConnection(socket, sessionId, playerId) {
    logger.info(`Player ${playerId} attempting to connect to session: ${sessionId}`);
    
    // Player-specific event handlers
    socket.on('JOIN_GAME', (data) => {
      const { nickname } = data;
      
      // Validate inputs
      if (!validateSession(sessionId) || !validatePlayer(playerId)) {
        socket.emit('error', { message: 'Invalid session or player ID' });
        return;
      }
      
      // Join or rejoin game
      const result = this.gameManager.joinGame(sessionId, playerId, nickname, socket.id);
      
      if (result.error) {
        socket.emit('error', { message: result.error });
      }
    });
    
    socket.on('SUBMIT_ANSWER', (data) => {
      const { answerIndex } = data;
      
      // Validate answer
      if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex > 3) {
        socket.emit('error', { message: 'Invalid answer' });
        return;
      }
      
      // Submit answer
      const result = this.gameManager.submitAnswer(sessionId, playerId, answerIndex);
      
      if (result.error) {
        socket.emit('error', { message: result.error });
      }
    });
    
    socket.on('RECONNECT', () => {
      logger.info(`Player ${playerId} attempting to reconnect to session: ${sessionId}`);
      const success = this.gameManager.handleReconnect(sessionId, playerId, socket.id);
      
      if (!success) {
        socket.emit('error', { message: 'Unable to reconnect' });
      }
    });
    
    socket.on('LEAVE_GAME', () => {
      logger.info(`Player ${playerId} leaving session: ${sessionId}`);
      // Player intentionally leaving (different from disconnect)
      this.gameManager.handleDisconnect(socket.id);
      socket.disconnect();
    });
  }

  // Get GameManager instance (for external access)
  getGameManager() {
    return this.gameManager;
  }

  // Broadcast to specific session (utility method)
  broadcastToSession(sessionId, event, data) {
    this.gameManager.broadcastToAll(sessionId, event, data);
  }
}

module.exports = WebSocketServer;
