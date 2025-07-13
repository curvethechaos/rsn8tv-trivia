// debug-test.js - WebSocket test with detailed debugging
const io = require('socket.io-client');
const axios = require('axios');

async function debugTest() {
  console.log('🔍 WebSocket Debug Test\n');

  // 1. Create session
  console.log('1️⃣ Creating session...');
  try {
    const response = await axios.post('http://localhost:3000/api/sessions/create', {
      hostId: 'debug-test-host'
    });
    
    const { sessionId, roomCode } = response.data;
    console.log(`✅ Session created: ${sessionId} (Room: ${roomCode})\n`);

    // 2. Connect host with debugging
    console.log('2️⃣ Connecting host with debug enabled...');
    const host = io('http://localhost:3000', {
      auth: { 
        role: 'host', 
        sessionId, 
        clientId: 'debug-test-host' 
      },
      transports: ['websocket', 'polling'], // Try both transports
      reconnection: false, // Disable auto-reconnect for clearer errors
    });

    // Add all possible event listeners
    host.on('connect', () => {
      console.log('✅ Host connected! Socket ID:', host.id);
    });

    host.on('connect_error', (error) => {
      console.error('❌ Host connection error:', error.message);
      console.error('Error type:', error.type);
      console.error('Full error:', error);
    });

    host.on('disconnect', (reason) => {
      console.log('🔌 Host disconnected:', reason);
    });

    host.on('host_connected', (data) => {
      console.log('📨 Host confirmation received:', JSON.stringify(data, null, 2));
    });

    host.on('error', (error) => {
      console.error('❌ Host socket error:', error);
    });

    // Wait longer for connection
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check connection status
    console.log('\n📊 Host connection status:', host.connected ? 'Connected' : 'Not connected');
    
    if (!host.connected) {
      console.log('⚠️  Host failed to connect. Checking server...');
      
      // Try a basic HTTP request to verify server is responding
      try {
        const health = await axios.get('http://localhost:3000/health');
        console.log('✅ Server is responding:', health.data);
      } catch (e) {
        console.error('❌ Server health check failed:', e.message);
      }
      
      host.disconnect();
      return;
    }

    // 3. Connect player with debugging
    console.log('\n3️⃣ Connecting player with debug enabled...');
    const player = io('http://localhost:3000', {
      auth: { 
        role: 'player', 
        sessionId, 
        clientId: 'debug-test-player' 
      },
      transports: ['websocket', 'polling'],
      reconnection: false,
    });

    player.on('connect', () => {
      console.log('✅ Player connected! Socket ID:', player.id);
    });

    player.on('connect_error', (error) => {
      console.error('❌ Player connection error:', error.message);
      console.error('Error type:', error.type);
    });

    player.on('player_connected', (data) => {
      console.log('📨 Player confirmation received:', JSON.stringify(data, null, 2));
    });

    player.on('error', (error) => {
      console.error('❌ Player socket error:', error);
    });

    // Wait for player connection
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 Player connection status:', player.connected ? 'Connected' : 'Not connected');

    if (host.connected && player.connected) {
      console.log('\n4️⃣ Both connected! Starting game...');
      
      // Listen for game events
      host.on('GAME_STARTED', (data) => {
        console.log('🎮 Game started event:', data);
      });

      player.on('GAME_STARTED', (data) => {
        console.log('🎮 Player received game start:', data);
      });

      player.on('QUESTION_READY', (data) => {
        console.log('❓ Question received:', data.questionNumber);
      });

      // Start the game
      host.emit('start_game');
      
      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    host.disconnect();
    player.disconnect();
    console.log('✅ Test complete!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Also test raw Socket.IO connection
async function testRawConnection() {
  console.log('\n\n🔧 Testing raw Socket.IO connection (no auth)...');
  
  const socket = io('http://localhost:3000', {
    autoConnect: true,
    reconnection: false,
  });

  socket.on('connect', () => {
    console.log('✅ Raw connection successful!');
    socket.disconnect();
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Raw connection failed:', error.message);
    console.error('This suggests Socket.IO is not properly initialized on the server');
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
}

// Run tests
async function runTests() {
  await debugTest();
  await testRawConnection();
  process.exit(0);
}

runTests().catch(console.error);
