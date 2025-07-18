const io = require('socket.io-client');

const SESSION_ID = 'fce57cfa-e0e6-4d38-b3aa-a142ccf0f48a'; // Update this if needed

console.log('Testing WebSocket connection...');
console.log('Connecting to: http://localhost:3000');
console.log('Session ID:', SESSION_ID);

const socket = io('http://localhost:3000', {
  auth: {
    role: 'host',
    sessionId: SESSION_ID,
    clientId: 'tablet-001'
  },
  transports: ['polling', 'websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  if (error.data) {
    console.error('Error data:', error.data);
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

setTimeout(() => {
  console.log('Test complete');
  socket.close();
  process.exit(0);
}, 5000);
