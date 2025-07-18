const WebSocket = require('ws');

function initializeWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
      console.log('Received:', message.toString());
    });
    
    ws.send(JSON.stringify({ type: 'CONNECTION_SUCCESS', message: 'Connected!' }));
  });
  
  return wss;
}

module.exports = { initializeWebSocketServer };
