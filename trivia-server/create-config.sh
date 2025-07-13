#!/bin/bash
# create-config.sh - Create the missing config file

cd /home/ubuntu/rsn8tv-trivia/trivia-server

echo "🔧 Creating missing config.js file..."

# Create a simple config.js
cat > config.js << 'EOF'
// config.js - Basic configuration
module.exports = {
  app: {
    baseUrl: process.env.BASE_URL || 'https://trivia.rsn8tv.com',
    wsUrl: process.env.WS_URL || 'wss://trivia.rsn8tv.com',
    corsOrigins: ['https://trivia.rsn8tv.com', 'http://localhost:3000']
  }
};
EOF

echo "✅ config.js created"

# Now check if there are other missing modules
echo -e "\n🔍 Checking for other errors..."
pm2 restart rsn8tv-backend
sleep 3
pm2 logs rsn8tv-backend --lines 10 --nostream

echo -e "\n📊 Current status:"
pm2 status
