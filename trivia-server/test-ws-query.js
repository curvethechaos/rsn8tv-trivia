const io = require('socket.io-client');

const SESSION_ID = 'fce57cfa-e0e6-4d38-b3aa-a142ccf0f48a';

console.log('Testing with query params (wsServer.js style)...');

// Try connecting as host using query params (as wsServer.js expects)
const hostSocket = io('http://localhost:3000', {
  query: {
    sessionId: SESSION_ID,
    isHost: 'true'
  }
});

hostSocket.on('connect', () => {
  console.log('✅ Host connected!');
});

hostSocket.on('connect_error', (err) => {
  console.log('❌ Host error:', err.message);
});

// Try player connection
setTimeout(() => {
  const playerSocket = io('http://localhost:3000', {
    query: {
      sessionId: SESSION_ID,
      playerId: 'player-001',
      isHost: 'false'
    }
  });

  playerSocket.on('connect', () => {
    console.log('✅ Player connected!');
  });

  playerSocket.on('connect_error', (err) => {
    console.log('❌ Player error:', err.message);
  });
}, 1000);

setTimeout(() => process.exit(0), 5000);
