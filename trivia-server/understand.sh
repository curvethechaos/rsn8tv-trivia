#!/bin/bash

# Restore working state and understand existing players endpoint

echo "========================================="
echo "Restoring Working State"
echo "========================================="
echo ""

# Find the most recent backup
BACKUP_DIR=$(ls -td ~/rsn8tv-backup-* | head -1)

echo "Step 1: Restoring original adminRoutes.js..."
echo "--------------------------------------------"

cd ~/rsn8tv-trivia/trivia-server/routes
cp "$BACKUP_DIR/adminRoutes.js.backup" adminRoutes.js

echo "✅ Restored adminRoutes.js"

echo ""
echo "Step 2: Looking at the existing players endpoint in server.js..."
echo "----------------------------------------------------------------"

cd ~/rsn8tv-trivia/trivia-server
echo "Current /api/admin/players implementation:"
grep -A30 "app.get.*admin/players" server.js

echo ""
echo "Step 3: Restarting server..."
echo "----------------------------"

pm2 restart rsn8tv

sleep 3
pm2 list

echo ""
echo "Step 4: Testing if it works..."
echo "------------------------------"

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "axiom", "password": "HirschF843"}' | \
  grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "✅ Auth working"
    echo ""
    echo "Testing existing players endpoint:"
    curl -s -H "Authorization: Bearer $TOKEN" \
      "http://localhost:3000/api/admin/players?limit=2" | \
      python3 -m json.tool | head -20
fi

echo ""
echo "========================================="
echo "Next Steps:"
echo "1. Modify the EXISTING endpoint in server.js"
echo "2. Add period filtering there"
echo "3. Don't touch adminRoutes.js"
echo "========================================="
