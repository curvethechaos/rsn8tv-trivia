// check-versions.js - Check Socket.IO version mismatch
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Socket.IO versions...\n');

// Check server package.json
try {
  const serverPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('📦 Server socket.io version:', serverPackage.dependencies['socket.io'] || 'Not found');
} catch (e) {
  console.error('Could not read server package.json');
}

// Check what's actually installed
try {
  const serverSocketIOPackage = JSON.parse(fs.readFileSync('node_modules/socket.io/package.json', 'utf8'));
  console.log('✅ Installed server socket.io:', serverSocketIOPackage.version);
  
  const engineIOPackage = JSON.parse(fs.readFileSync('node_modules/engine.io/package.json', 'utf8'));
  console.log('✅ Installed engine.io:', engineIOPackage.version);
} catch (e) {
  console.error('Could not read installed server packages');
}

console.log('\n---\n');

// Check client version
try {
  const clientPackage = JSON.parse(fs.readFileSync('node_modules/socket.io-client/package.json', 'utf8'));
  console.log('📦 Installed socket.io-client:', clientPackage.version);
  
  const clientEnginePackage = JSON.parse(fs.readFileSync('node_modules/engine.io-client/package.json', 'utf8'));
  console.log('✅ Installed engine.io-client:', clientEnginePackage.version);
} catch (e) {
  console.error('Could not read client packages');
}

console.log('\n🔧 Solution:\n');
console.log('The server and client versions must be compatible.');
console.log('Socket.IO v4.x server requires socket.io-client v4.x');
console.log('\nRun this command to fix:');
console.log('npm install socket.io-client@4 --save-dev');
