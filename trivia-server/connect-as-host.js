const io = require('socket.io-client');

const sessionId = process.argv[2];
if (!sessionId) {
  console.log('Usage: node connect-as-host.js <sessionId>');
  process.exit(1);
}

console.log(`Connecting as host to session: ${sessionId}`);

const socket = io('http://localhost:3000', {
  auth: {
    role: 'host',
    sessionId: sessionId,
    clientId: 'test-host'
  }
});

socket.on('connect', () => {
  console.log('✅ Connected as host! Room created.');
  console.log('Players can now join this session.');
  
  // Keep the connection alive
  console.log('Press Ctrl+C to disconnect host...');
});

socket.on('error', (error) => {
  console.error('Error:', error);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  process.exit(0);
});
