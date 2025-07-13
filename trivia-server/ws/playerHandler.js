// playerHandler.js - WebSocket handler for player connections
module.exports = (io, socket, app) => {
  console.log(`Player connected: ${socket.id}`);

  // Handle player joining
  socket.on('player:join_room', async (data) => {
    const { sessionId, clientId } = data;

    if (!sessionId || !clientId) {
      socket.emit('error', { message: 'Missing sessionId or clientId' });
      return;
    }

    // Verify session exists using the existing db connection
    const db = app.locals.db;
    try {
      const session = await db('sessions')
        .where({ id: sessionId, is_active: true })
        .first();

      if (!session) {
        socket.emit('error', { message: 'Invalid session' });
        return;
      }
    } catch (error) {
      console.error('Session check error:', error);
      socket.emit('error', { message: 'Session verification failed' });
      return;
    }

    // Join the room
    socket.join(sessionId); // join game room
    socket.join(clientId); //
    socket.clientId = clientId; //
    socket.sessionId = sessionId;
    socket.role = 'player';

    // Notify others
    socket.to(sessionId).emit('PLAYER_JOINED', {
      playerId: clientId,
      playerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0
    });

    // Add player to GameManager
    const gameManager = app.locals.gameManager;
    if (gameManager) {
      const nickname = data.nickname || `Player ${io.sockets.adapter.rooms.get(sessionId)?.size || 1}`;
      gameManager.addPlayer(sessionId, clientId, nickname);
      console.log(`Added player ${clientId} to GameManager with nickname: ${nickname}`);
    } else {
      console.error('GameManager not found in app.locals');
    }

    console.log(`Player ${clientId} joined session ${sessionId}`);
  });

  // Handle any player starting the game
  socket.on('START_GAME', async (data) => {
    const { sessionId, clientId } = data;

    if (!sessionId || !clientId) {
      socket.emit('error', { message: 'Missing required data' });
      return;
    }

    // Any player can start, but verify they're in the session
    const db = app.locals.db;
    const playerCheck = await db('players')
      .where({ session_id: sessionId, client_id: clientId })
      .first();

    if (!playerCheck) {
      socket.emit('error', { message: 'You must join the session first' });
      return;
    }

    // Update session to started
    await db('sessions')
      .where({ id: sessionId })
      .update({
        status: 'playing',
        started_at: new Date()
      });

    console.log(`Game starting for session ${sessionId}`);

    // Emit game starting event
    io.to(sessionId).emit('GAME_STARTING', {
      message: 'Game is starting!',
      startedBy: clientId
    });

    // Start the game immediately via GameManager
    // GameManager will handle its own countdown
    const gameManager = app.locals.gameManager;
    if (gameManager) {
      console.log(`Starting game via GameManager for session ${sessionId}`);
      gameManager.startGame(sessionId);
    } else {
      console.error("GameManager not found!");
      io.to(sessionId).emit("error", { message: "Game system error" });
    }
  });

  // Handle START_NEW_GAME event
  socket.on('START_NEW_GAME', async (data) => {
    try {
      console.log('Player requesting new game:', data);
      
      const { sessionId, playerId } = data;
      const gameManager = app.locals.gameManager;
      const db = app.locals.db;
      const triviaAPIService = app.locals.triviaAPIService;
      
      const oldGame = gameManager.games.get(sessionId);
      
      if (!oldGame) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Get old session from database
      const oldSession = await db('sessions').where({ id: sessionId }).first();
      if (!oldSession) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Create new session
      const newSessionId = 'session-' + Math.random().toString(36).substr(2, 9);
      
      // Copy players from old game
      const players = Array.from(oldGame.players.values()).map(player => ({
        ...player,
        totalScore: 0,
        answers: [],
        currentStreak: 0,
        longestStreak: 0,
        correctAnswers: 0,
        totalQuestions: 0,
        roundScores: { 1: 0, 2: 0, 3: 0, 4: 0 },
        perfectRounds: []
      }));

      // Create new session in database
      await db('sessions').insert({
        id: newSessionId,
        venue_id: oldSession.venue_id,
        host_socket_id: oldGame.hostSocketId,
        is_active: true,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'waiting'  // Changed from game_state to status
      });

      // Fetch new questions
      const questions = await triviaAPIService.fetchQuestions();
      await db('questions_cache').insert({
        session_id: newSessionId,
        questions: JSON.stringify(questions),
        cached_at: new Date()
      });

      // Create new game in GameManager
      const newGame = gameManager.createGame(newSessionId);
      newGame.hostSocketId = oldGame.hostSocketId;
      newGame.settings = oldGame.settings;
      newGame.questions = questions;

      // Add players to new game
      players.forEach(player => {
        newGame.players.set(player.clientId, player);
      });

      console.log('New game created:', newSessionId, 'with', players.length, 'players');

      // Notify all players in the room about the new game
      io.to(sessionId).emit('PLAY_AGAIN', {
        newSessionId: newSessionId,
        message: 'Starting new game with same players!'
      });

      // Update host display
      if (oldGame.hostSocketId) {
        const hostSocket = io.sockets.sockets.get(oldGame.hostSocketId);
        if (hostSocket) {
          // Leave old room
          hostSocket.leave(sessionId);
          // Join new room
          hostSocket.join(newSessionId);
          hostSocket.sessionId = newSessionId;
          
          // Send host the new session info
          hostSocket.emit('NEW_SESSION_CREATED', {
            oldSessionId: sessionId,
            newSessionId: newSessionId,
            players: Array.from(newGame.players.values())
          });
        }
      }

      // Move all player sockets to new room
      const playerSockets = await io.in(sessionId).fetchSockets();
      for (const playerSocket of playerSockets) {
        playerSocket.leave(sessionId);
        playerSocket.join(newSessionId);
        playerSocket.sessionId = newSessionId;
      }

      // Clean up old session
      gameManager.games.delete(sessionId);
      await db('sessions')
        .where('id', sessionId)
        .update({ is_active: false });

      console.log('Successfully started new game:', newSessionId);

    } catch (error) {
      console.error('Error starting new game:', error);
      socket.emit('error', { message: 'Failed to start new game' });
    }
  });

  // Handle answer submission
  socket.on('SUBMIT_ANSWER', async (data) => {
    const { questionId, answerIndex, responseTimeMs } = data;
    const { sessionId, clientId } = socket;

    if (!sessionId || !clientId) {
      socket.emit('error', { message: 'Not properly connected' });
      return;
    }

    const gameManager = app.locals.gameManager;
    if (gameManager) {
      const result = await gameManager.submitAnswer(sessionId, clientId, {
        questionId,
        answerIndex,
        responseTimeMs
      });

      if (result) {
        socket.emit('ANSWER_RESULT', result);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const { sessionId, clientId } = socket;

    if (sessionId && clientId) {
      socket.to(sessionId).emit('PLAYER_LEFT', {
        playerId: clientId,
        playerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0
      });
    }

    console.log(`Player disconnected: ${socket.id}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Player socket error: ${error.message}`);
  });
};
