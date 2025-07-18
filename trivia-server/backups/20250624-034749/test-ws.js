// test-ws-correct.js - Test WebSocket connections matching server.js auth pattern
const io = require('socket.io-client');

// Use your actual sessionId from the create response
const SESSION_ID = 'd38e5038-e781-49cb-b4d9-53ea893afbe0';
const SERVER_URL = 'http://localhost:3000';

console.log('🚀 Testing RSN8TV Trivia WebSocket connections...\n');
console.log('Session ID:', SESSION_ID);

// Connect as host (matching server.js auth pattern)
console.log('Connecting host...');
const hostSocket = io(SERVER_URL, {
  auth: {
    sessionId: SESSION_ID,
    clientId: 'tablet-001',
    role: 'host'
  }
});

hostSocket.on('connect', () => {
  console.log('✅ Host connected:', hostSocket.id);
});

hostSocket.on('connect_error', (error) => {
  console.error('❌ Host connection error:', error.message);
});

hostSocket.on('host_connected', (data) => {
  console.log('📱 Host connection confirmed:', data);
});

hostSocket.on('PLAYER_JOINED', (data) => {
  console.log('👤 Player joined:', data);
});

hostSocket.on('GAME_STARTED', (data) => {
  console.log('🎮 Game started:', data);
});

hostSocket.on('QUESTION_UPDATE', (data) => {
  console.log('\n❓ New question for host display:');
  console.log('  Question #:', data.questionNumber);
  console.log('  Round:', data.roundNumber);
  console.log('  Question:', data.question);
  console.log('  Time limit:', data.timeLimit, 'seconds');
});

hostSocket.on('error', (error) => {
  console.error('❌ Host error:', error);
});

// Connect as player after 2 seconds
setTimeout(() => {
  console.log('\nConnecting player...');
  const playerSocket = io(SERVER_URL, {
    auth: {
      sessionId: SESSION_ID,
      clientId: 'player-001',
      role: 'player'
    }
  });

  playerSocket.on('connect', () => {
    console.log('✅ Player connected:', playerSocket.id);
  });

  playerSocket.on('connect_error', (error) => {
    console.error('❌ Player connection error:', error.message);
  });

  playerSocket.on('player_connected', (data) => {
    console.log('🎮 Player connection confirmed:', data);
  });

  playerSocket.on('GAME_JOINED', (data) => {
    console.log('🎯 Player joined game:', data);
  });

  playerSocket.on('QUESTION_READY', (data) => {
    console.log('\n📋 Question ready for player:');
    console.log('  Answer options:', data.answers);
    console.log('  Time limit:', data.timeLimit, 'seconds');
    
    // Simulate answering after 2 seconds
    setTimeout(() => {
      console.log('📤 Player submitting answer: B (index 1)');
      playerSocket.emit('submit_answer', { answerIndex: 1 });
    }, 2000);
  });

  playerSocket.on('ANSWER_SUBMITTED', (data) => {
    console.log('✅ Answer confirmed:', data);
  });

  playerSocket.on('ANSWER_RESULT', (data) => {
    console.log('📊 Answer result:', data);
  });

  playerSocket.on('error', (error) => {
    console.error('❌ Player error:', error);
  });

  // Start game after player connects
  setTimeout(() => {
    console.log('\n🚀 Host starting game...');
    hostSocket.emit('start_game');
  }, 3000);

}, 2000);

// Keep script running for 30 seconds
setTimeout(() => {
  console.log('\n✅ Test completed. Press Ctrl+C to exit.');
  process.exit(0);
}, 30000);
