// wsServer.js - WebSocket server setup with host/player routing
const socketIO = require('socket.io');
const { handlePlayerEvents } = require('./playerHandler');
const { handleHostEvents } = require('./hostHandler');
const GameManager = require('../services/gameManager');
const logger = require('../utils/logger');
const knex = require('../db/connection');

let io;
let gameManager;

const initializeWebSocketServer = (server, db) => {
  io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Initialize game manager
  gameManager = new GameManager(io, db);

  io.on('connection', (socket) => {
    const { role, sessionId, clientId } = socket.handshake.auth;
    
    console.log(`[WebSocket] ${role} connected:`, {
      sessionId,
      clientId,
      socketId: socket.id
    });

    // Route based on role
    if (role === 'host') {
      handleHostEvents(io, socket, gameManager);
      
      // Add session info handler for hosts
      socket.on('get-session-info', async (data) => {
        try {
          console.log('Host requesting session info:', data.sessionId);
          
          // Get session from database
          const session = await knex('sessions')
            .where('id', data.sessionId)
            .first();
          
          if (session) {
            const baseUrl = process.env.BASE_URL || `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`;
            const joinUrl = `${baseUrl}/join/${session.id}`;
            
            socket.emit('session-info', {
              sessionId: session.id,
              roomCode: session.room_code,
              joinUrl: joinUrl,
              isActive: session.is_active,
              createdAt: session.created_at
            });
            
            console.log('Sent session info to host:', {
              roomCode: session.room_code,
              joinUrl: joinUrl
            });
          } else {
            socket.emit('error', { message: 'Session not found' });
          }
        } catch (error) {
          console.error('Error getting session info:', error);
          socket.emit('error', { message: 'Failed to get session info' });
        }
      });
    } else if (role === 'player') {
      handlePlayerEvents(io, socket, gameManager);
    } else {
      console.error(`[WebSocket] Unknown role: ${role}`);
      socket.disconnect();
    }

    // Common events that both host and player might use
    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('error', (error) => {
      logger.error(`[WebSocket] Socket error:`, error);
    });
  });

  console.log('[WebSocket] Server initialized');
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
};

module.exports = {
  initializeWebSocketServer,
  getIO
};
