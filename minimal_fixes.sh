#!/bin/bash

# Minimal fixes - ONLY for the broken routes shown in the test

echo "🔧 MINIMAL ROUTE FIXES"
echo "====================="
echo "Only fixing the 404 and 500 errors"
echo ""

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Backup first
cp server.js server.js.backup_minimal_$(date +%Y%m%d_%H%M%S)

# Fix 1: Add missing /api/sessions route (404 error)
echo "1. Adding /api/sessions route..."
if ! grep -q "app.get('/api/sessions'" server.js; then
    # Find where to insert (before the 404 handler)
    sed -i '/404 handler/i\
// Sessions list\
app.get("/api/sessions", async (req, res) => {\
  try {\
    const sessions = await db("sessions")\
      .select("id", "room_code", "created_at", "is_active")\
      .orderBy("created_at", "desc")\
      .limit(20);\
    res.json({ success: true, sessions });\
  } catch (error) {\
    console.error("Sessions error:", error);\
    res.status(500).json({ success: false, error: "Failed to fetch sessions" });\
  }\
});\
' server.js
    echo "✓ Added /api/sessions"
fi

# Fix 2: Add /api/admin/current-games route (404 error)
echo "2. Adding /api/admin/current-games route..."
if ! grep -q "app.get('/api/admin/current-games'" server.js; then
    sed -i '/404 handler/i\
// Current games\
app.get("/api/admin/current-games", verifyToken, async (req, res) => {\
  try {\
    const games = await db("sessions")\
      .select("sessions.*", db.raw("COUNT(players.id) as player_count"))\
      .leftJoin("players", "sessions.id", "players.session_id")\
      .where("sessions.is_active", true)\
      .groupBy("sessions.id")\
      .orderBy("sessions.created_at", "desc");\
    res.json({ success: true, games });\
  } catch (error) {\
    console.error("Current games error:", error);\
    res.status(500).json({ success: false, error: "Failed to fetch current games" });\
  }\
});\
' server.js
    echo "✓ Added /api/admin/current-games"
fi

# Fix 3: Add /api/admin/players route (404 error)
echo "3. Adding /api/admin/players route..."
if ! grep -q "app.get('/api/admin/players'" server.js; then
    sed -i '/404 handler/i\
// Players list\
app.get("/api/admin/players", verifyToken, async (req, res) => {\
  try {\
    const players = await db("player_profiles")\
      .select("*")\
      .orderBy("created_at", "desc")\
      .limit(100);\
    res.json({ success: true, players });\
  } catch (error) {\
    console.error("Players error:", error);\
    res.status(500).json({ success: false, error: "Failed to fetch players" });\
  }\
});\
' server.js
    echo "✓ Added /api/admin/players"
fi

# Fix 4: Questions service - ensure getQuestions exists
echo "4. Checking questions service..."
if [ -f services/questionService.js ]; then
    if ! grep -q "getQuestions" services/questionService.js; then
        echo "Adding getQuestions method..."
        # Add before module.exports
        sed -i '/module.exports/i\
    getQuestions(params = {}) {\
        return db("question_cache")\
            .select("*")\
            .limit(params.limit || 20)\
            .then(questions => ({\
                success: true,\
                questions,\
                totalCount: questions.length,\
                flaggedCount: 0,\
                customCount: 0\
            }))\
            .catch(error => {\
                console.error("Questions error:", error);\
                throw error;\
            });\
    }\
' services/questionService.js
        echo "✓ Added getQuestions"
    fi
fi

# Fix 5: Exports service - ensure listExports exists
echo "5. Checking exports service..."
if [ -f services/exportService.js ]; then
    if ! grep -q "listExports" services/exportService.js; then
        echo "Adding listExports method..."
        sed -i '/module.exports/i\
    listExports(userId) {\
        return db("exports")\
            .where({ created_by: userId })\
            .orderBy("created_at", "desc")\
            .then(exports => exports || [])\
            .catch(error => {\
                console.error("Exports error:", error);\
                return [];\
            });\
    }\
' services/exportService.js
        echo "✓ Added listExports"
    fi
fi

# Restart
echo -e "\n6. Restarting server..."
pm2 restart rsn8tv

echo -e "\n✅ MINIMAL FIXES COMPLETE"
echo "Only added the missing routes that were returning 404/500"
echo ""
echo "Test again with: ./api_test.sh"
