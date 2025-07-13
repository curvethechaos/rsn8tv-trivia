const io = require('socket.io-client');

console.log('Attempting connection...');

const socket = io('http://localhost:3000', {
  auth: {
    role: 'player',
    sessionId: 'fce57cfa-e0e6-4d38-b3aa-a142ccf0f48a',
    clientId: 'test-player-001'
  }
});

socket.on('connect', () => console.log('✅ Connected'));
socket.on('connect_error', (err) => console.log('❌ Error:', err.message));

setTimeout(() => process.exit(0), 3000);
