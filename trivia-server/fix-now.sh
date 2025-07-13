#!/bin/bash
# fix-now.sh - Get server back online immediately

echo "🚨 FIXING SERVER NOW"
echo "==================="

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# 1. Check what's wrong
echo "1. Checking PM2 status..."
pm2 status

# 2. Look at the actual error
echo -e "\n2. Last error from logs:"
pm2 logs rsn8tv-backend --err --lines 10 --nostream

# 3. Find and restore backups
echo -e "\n3. Finding backup files..."

# Look for the most recent backup files
if [ -f "routes/sessionRoutes.js.backup" ]; then
    echo "Restoring sessionRoutes.js..."
    cp routes/sessionRoutes.js.backup routes/sessionRoutes.js
fi

if [ -f "ws/playerHandler.js.backup" ]; then
    echo "Restoring playerHandler.js..."
    cp ws/playerHandler.js.backup ws/playerHandler.js
fi

if [ -f "services/gameManager.js.backup" ]; then
    echo "Restoring gameManager.js..."
    cp services/gameManager.js.backup services/gameManager.js
fi

if [ -f "server.js.backup" ]; then
    echo "Restoring server.js..."
    cp server.js.backup server.js
fi

# 4. Also check for timestamped backups
echo -e "\n4. Checking for timestamped backups..."
ls -la server.js.backup* 2>/dev/null
ls -la routes/sessionRoutes.js.backup* 2>/dev/null
ls -la ws/playerHandler.js.backup* 2>/dev/null
ls -la services/gameManager.js.backup* 2>/dev/null

# 5. If you see any timestamped backups above, restore the most recent one
# For example: cp server.js.backup-20250620-123456 server.js

# 6. Restart PM2
echo -e "\n5. Restarting server..."
pm2 delete rsn8tv-backend 2>/dev/null
pm2 start server.js --name rsn8tv-backend

# 7. Wait and check
sleep 3
echo -e "\n6. Checking if server is running..."
curl -s http://localhost:3000/health

# 8. Show current status
echo -e "\n7. Current PM2 status:"
pm2 status

echo -e "\n==================="
echo "If still not working:"
echo "1. Look at the error in step 2 above"
echo "2. Restore a specific timestamped backup from step 4"
echo "3. Run: pm2 logs rsn8tv-backend -f"
echo "   to see real-time errors"
