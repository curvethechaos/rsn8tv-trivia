// quick-test.js - Minimal WebSocket test
const io = require('socket.io-client');
const axios = require('axios');

async function quickTest() {
  console.log('🚀 Quick WebSocket Test\n');

  // 1. Create session
  console.log('1️⃣ Creating session...');
  const { data } = await axios.post('http://localhost:3000/api/sessions/create', {
    hostId: 'quick-test-host'
  });
  
  const { sessionId, roomCode } = data;
  console.log(`✅ Session created: ${sessionId} (Room: ${roomCode})\n`);

  // 2. Connect host
  console.log('2️⃣ Connecting host...');
  const host = io('http://localhost:3000', {
    auth: { role: 'host', sessionId, clientId: 'quick-test-host' }
  });

  host.on('connect', () => console.log('✅ Host connected'));
  host.on('host_connected', (data) => console.log('📨 Host confirmed:', data));

  await new Promise(r => setTimeout(r, 1000));

  // 3. Connect player
  console.log('\n3️⃣ Connecting player...');
  const player = io('http://localhost:3000', {
    auth: { role: 'player', sessionId, clientId: 'quick-test-player' }
  });

  player.on('connect', () => console.log('✅ Player connected'));
  player.on('player_connected', (data) => console.log('📨 Player confirmed:', data));

  await new Promise(r => setTimeout(r, 1000));

  // 4. Start game
  console.log('\n4️⃣ Starting game...');
  host.emit('start_game');

  // 5. Listen for first question
  player.on('QUESTION_READY', (data) => {
    console.log('\n❓ Question received!');
    console.log('Round:', data.round);
    console.log('Question #:', data.questionNumber);
    console.log('Time limit:', data.timeLimit, 'seconds');
    
    // Submit answer
    setTimeout(() => {
      console.log('\n📤 Submitting answer...');
      player.emit('submit_answer', { answerIndex: 2 });
    }, 2000);
  });

  player.on('ANSWER_RESULT', (data) => {
    console.log('\n📊 Answer result:', data);
    
    // Clean up after first question
    setTimeout(() => {
      console.log('\n🧹 Cleaning up...');
      host.disconnect();
      player.disconnect();
      console.log('✅ Test complete!');
      process.exit(0);
    }, 1000);
  });

  // Error handlers
  host.on('error', (e) => console.error('❌ Host error:', e));
  player.on('error', (e) => console.error('❌ Player error:', e));
}

quickTest().catch(console.error);
