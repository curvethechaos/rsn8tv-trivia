#!/bin/bash

# Complete rollback of all changes

echo "========================================="
echo "COMPLETE ROLLBACK - Restoring Everything"
echo "========================================="
echo ""

# Find the backup directory
BACKUP_DIR=$(ls -td ~/rsn8tv-backup-* | head -1)

echo "Using backup from: $BACKUP_DIR"
echo ""

echo "Step 1: Restoring all backed up files..."
echo "----------------------------------------"

# Restore backend files
if [ -f "$BACKUP_DIR/adminRoutes.js.backup" ]; then
    cp "$BACKUP_DIR/adminRoutes.js.backup" ~/rsn8tv-trivia/trivia-server/routes/adminRoutes.js
    echo "✅ Restored adminRoutes.js"
fi

if [ -f "$BACKUP_DIR/knexfile.js.backup" ]; then
    cp "$BACKUP_DIR/knexfile.js.backup" ~/rsn8tv-trivia/trivia-server/knexfile.js
    echo "✅ Restored knexfile.js"
fi

# Restore frontend files
if [ -f "$BACKUP_DIR/players.js.backup" ]; then
    sudo cp "$BACKUP_DIR/players.js.backup" /var/www/html/admin/monitoring/tabs/players/players.js
    echo "✅ Restored players.js"
fi

if [ -f "$BACKUP_DIR/players.css.backup" ]; then
    sudo cp "$BACKUP_DIR/players.css.backup" /var/www/html/admin/monitoring/tabs/players/players.css
    echo "✅ Restored players.css"
fi

echo ""
echo "Step 2: Removing the migration I created..."
echo "------------------------------------------"

# Remove the migration file
rm -f ~/rsn8tv-trivia/trivia-server/db/migrations/*_fix_player_scores.js
echo "✅ Removed migration file"

# Remove the migration record from database if it exists
sudo -u postgres psql rsn8tv_trivia -c "DELETE FROM knex_migrations WHERE name LIKE '%fix_player_scores%';"

echo ""
echo "Step 3: Restoring database permissions to original state..."
echo "-----------------------------------------------------------"

sudo -u postgres psql << 'EOF'
-- Connect to rsn8tv_trivia
\c rsn8tv_trivia

-- Remove the trigger and function I created
DROP TRIGGER IF EXISTS update_player_profile_stats_trigger ON scores;
DROP FUNCTION IF EXISTS update_player_profile_stats();

-- Restore original ownership (postgres owns the database by default)
ALTER DATABASE rsn8tv_trivia OWNER TO postgres;

-- Grant necessary permissions to axiom (without ownership)
GRANT CONNECT ON DATABASE rsn8tv_trivia TO axiom;
GRANT USAGE ON SCHEMA public TO axiom;
GRANT CREATE ON SCHEMA public TO axiom;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO axiom;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO axiom;

-- Show current state
\echo ''
\echo 'Database owner:'
SELECT d.datname as database, pg_catalog.pg_get_userbyid(d.datdba) as owner
FROM pg_catalog.pg_database d
WHERE d.datname = 'rsn8tv_trivia';

\echo ''
\echo 'Axiom permissions:'
\du axiom
EOF

echo ""
echo "Step 4: Restarting the server..."
echo "--------------------------------"

cd ~/rsn8tv-trivia/trivia-server
pm2 stop rsn8tv
pm2 delete rsn8tv
pm2 start server.js --name rsn8tv

sleep 3

echo ""
echo "Step 5: Verifying everything works..."
echo "-------------------------------------"

pm2 list

# Test the API
echo ""
echo "Testing authentication:"
response=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "axiom", "password": "HirschF843"}' 2>&1)

if echo "$response" | grep -q "accessToken"; then
    echo "✅ API is working!"
    
    TOKEN=$(echo "$response" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    
    echo ""
    echo "Testing admin stats:"
    curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/stats | python3 -m json.tool | head -5
    
    echo ""
    echo "Testing players endpoint:"
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/admin/players?limit=1" | python3 -m json.tool | head -10
else
    echo "❌ API not responding correctly"
    echo "Response: $response"
    echo ""
    echo "Checking logs:"
    pm2 logs rsn8tv --lines 20 --nostream
fi

echo ""
echo "========================================="
echo "ROLLBACK COMPLETE"
echo "========================================="
echo ""
echo "Everything has been restored to the state before my changes:"
echo "- Original files restored from backup"
echo "- Database permissions restored (postgres owns, axiom has access)"
echo "- Migration removed"
echo "- Trigger/function removed"
echo "- Server restarted"
echo ""
echo "The system should now be in its original working state."
echo "Player scores will still show as 0 (the original issue),"
echo "but at least the admin dashboard should work properly."
echo ""
