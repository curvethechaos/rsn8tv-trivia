#!/bin/bash

echo "=== RSN8TV TRIVIA SYSTEM STATUS CHECK ==="
echo "Generated: $(date)"
echo "========================================="

# Database connection info
DB_NAME="rsn8tv_trivia"
DB_USER="axiom"

echo -e "\n📊 DATABASE TABLES:"
echo "-------------------"
psql -U $DB_USER -d $DB_NAME -c "\dt" 2>/dev/null | grep -E "^ public" | awk '{print $3}' | sort

echo -e "\n📋 CRITICAL TABLES CHECK:"
echo "-------------------------"
for table in branding_config prize_configurations prize_claims questions question_responses system_settings venues email_campaigns exports themes; do
    if psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM $table LIMIT 1;" &>/dev/null; then
        count=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null | tr -d ' ')
        echo "✅ $table - $count rows"
    else
        echo "❌ $table - MISSING or ERROR"
    fi
done

echo -e "\n🔍 QUESTIONS TABLE STRUCTURE:"
echo "-----------------------------"
psql -U $DB_USER -d $DB_NAME -c "\d questions" 2>/dev/null | grep -E "^ [a-z_]+" | head -10

echo -e "\n📁 SERVER FILES CHECK:"
echo "---------------------"
cd ~/rsn8tv-trivia/trivia-server 2>/dev/null || echo "❌ Server directory not found"

echo "Services directory:"
ls -la services/ 2>/dev/null | grep -E "Service\.js$" | awk '{print "  - " $9}'

echo -e "\nRoutes directory:"
ls -la routes/ 2>/dev/null | grep -E "Routes\.js$" | awk '{print "  - " $9}'

echo -e "\n🔄 MIGRATION STATUS:"
echo "-------------------"
psql -U $DB_USER -d $DB_NAME -c "SELECT filename, migrated_at FROM knex_migrations ORDER BY migrated_at DESC LIMIT 10;" 2>/dev/null

echo -e "\n🖥️  SERVER STATUS:"
echo "-----------------"
pm2 list 2>/dev/null | grep -E "rsn8|trivia" || echo "No PM2 processes found"

echo -e "\n🌐 API ENDPOINTS TEST:"
echo "---------------------"
# Test basic endpoint
curl -s -o /dev/null -w "Game Health Check: %{http_code}\n" https://trivia.rsn8tv.com/health 2>/dev/null || echo "Game Health Check: FAILED"

# Test admin endpoint (should return 401 without auth)
curl -s -o /dev/null -w "Admin API Check: %{http_code} (401 = auth working)\n" https://trivia.rsn8tv.com/api/admin/stats 2>/dev/null || echo "Admin API Check: FAILED"

echo -e "\n📊 RECENT GAME ACTIVITY:"
echo "------------------------"
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT 
    'Active sessions: ' || COUNT(CASE WHEN is_active THEN 1 END) || ' / Total: ' || COUNT(*)
FROM sessions
WHERE created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null

psql -U $DB_USER -d $DB_NAME -t -c "
SELECT 
    'Players today: ' || COUNT(DISTINCT player_id)
FROM scores
WHERE submitted_at > NOW() - INTERVAL '24 hours';" 2>/dev/null

echo -e "\n🔐 ADMIN USERS:"
echo "---------------"
psql -U $DB_USER -d $DB_NAME -c "SELECT username, role, is_active, last_login FROM admin_users;" 2>/dev/null | head -5

echo -e "\n⚙️  ENV VARIABLES:"
echo "-----------------"
cd ~/rsn8tv-trivia/trivia-server 2>/dev/null
if [ -f .env ]; then
    echo "AWS configured: $(grep -q 'AWS_ACCESS_KEY_ID=' .env && echo '✅' || echo '❌')"
    echo "S3 bucket: $(grep 'S3_BUCKET=' .env | cut -d'=' -f2 || echo 'NOT SET')"
    echo "JWT secret: $(grep -q 'JWT_SECRET=' .env && echo '✅' || echo '❌')"
else
    echo "❌ .env file not found"
fi

echo -e "\n📝 LAST SERVER LOGS:"
echo "-------------------"
pm2 logs rsn8tv-trivia --lines 5 --nostream 2>/dev/null | tail -10 || echo "No PM2 logs available"

echo -e "\n========================================="
echo "STATUS CHECK COMPLETE"
echo "========================================="
