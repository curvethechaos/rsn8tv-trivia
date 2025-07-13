const io = require('socket.io-client');

console.log('Testing basic Socket.IO connection...');

const socket = io('http://localhost:3000', {
  transports: ['polling', 'websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected!', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.type, error.message);
  if (error.data) {
    console.error('Error data:', error.data);
  }
});

setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 5000);
