// ws/hostHandler.js - Fixed Host WebSocket handlers with GameManager integration

function setupHostHandlers(io, socket, app) {
  console.log(`Setting up host handlers for socket ${socket.id}`);

  // Extract sessionId from the connection data
  socket.on('HOST_JOIN', (data) => {
    const { sessionId } = data;

    if (!sessionId) {
      console.error('No sessionId provided in HOST_JOIN');
      socket.emit('error', { message: 'Missing sessionId' });
      return;
    }

    const gameManager = app.locals.gameManager;
    if (!gameManager) {
      console.error('GameManager not found in app.locals');
      socket.emit('error', { message: 'Game system not initialized' });
      return;
    }

    // Check if game exists
    const game = gameManager.games.get(sessionId);
    if (!game) {
      console.error(`No game found for session ${sessionId}`);
      socket.emit('error', { message: 'Game session not found' });
      return;
    }

    // Store session info on socket
    socket.sessionId = sessionId;
    socket.role = 'host';

    // Join the session room
    socket.join(sessionId);
    console.log(`Host ${socket.id} joined room ${sessionId}`);

    // Notify that host is connected
    socket.emit('host:connected', {
      sessionId,
      message: 'Connected as host',
      playerCount: game.players.size
    });

    // Send current player list if any exist
    if (game.players.size > 0) {
      const playerList = Array.from(game.players.entries()).map(([clientId, player]) => ({
        clientId,
        nickname: player.nickname,
        score: player.totalScore
      }));

      socket.emit('PLAYER_UPDATE', {
        playerCount: game.players.size,
        players: playerList
      });
    }
  });

  // Listen for game control events from host
  socket.on('host:start_game', (data) => {
    const { sessionId } = socket;

    if (!sessionId) {
      console.error('Host not properly connected - no sessionId');
      socket.emit('error', { message: 'Not properly connected' });
      return;
    }

    console.log(`Host requesting to start game for session ${sessionId}`);
    const gameManager = app.locals.gameManager;
    if (gameManager) {
      gameManager.startGame(sessionId);
    }
  });

  // Handle play again request from host
  socket.on('host:play_again', async () => {
    const { sessionId } = socket;

    if (!sessionId) {
      socket.emit('error', { message: 'No active session' });
      return;
    }

    console.log(`Host requesting play again for session ${sessionId}`);
    const gameManager = app.locals.gameManager;

    if (gameManager) {
      const result = await gameManager.playAgain(sessionId);

      if (result.success) {
        // Update host's socket session
        socket.sessionId = result.newSessionId;
        socket.leave(sessionId);
        socket.join(result.newSessionId);

        console.log(`New game created: ${result.newSessionId}`);
      } else {
        socket.emit('error', { message: result.error });
      }
    }
  });

  socket.on('disconnect', () => {
    const { sessionId } = socket;
    if (sessionId) {
      console.log(`Host ${socket.id} disconnected from session ${sessionId}`);
    } else {
      console.log(`Host ${socket.id} disconnected (no session)`);
    }
    // Don't destroy the game, players might still be connected
  });

  socket.on('error', (error) => {
    console.error(`Host socket error:`, error);
  });
}

// Export as function that server.js expects
module.exports = (io, socket, app) => setupHostHandlers(io, socket, app);
