#!/bin/bash
# Find what's actually causing the server to crash

cd /home/ubuntu/rsn8tv-trivia/trivia-server

echo "🔍 DIAGNOSING SERVER CRASH"
echo "========================="

# 1. Check PM2 error logs
echo -e "\n1️⃣ PM2 Error Logs (last 50 lines):"
pm2 logs rsn8tv-backend --err --lines 50 --nostream

# 2. Try starting with node directly to see clear error
echo -e "\n2️⃣ Starting with node to see error:"
timeout 5 node server.js 2>&1 | head -30

# 3. Check if all required files exist
echo -e "\n3️⃣ Checking required files:"
echo "✓ server.js exists: $([ -f server.js ] && echo YES || echo NO)"
echo "✓ routes/sessionRoutes.js exists: $([ -f routes/sessionRoutes.js ] && echo YES || echo NO)"
echo "✓ routes/playerRoutes.js exists: $([ -f routes/playerRoutes.js ] && echo YES || echo NO)"
echo "✓ routes/leaderboardRoutes.js exists: $([ -f routes/leaderboardRoutes.js ] && echo YES || echo NO)"
echo "✓ routes/adminRoutes.js exists: $([ -f routes/adminRoutes.js ] && echo YES || echo NO)"
echo "✓ ws/playerHandler.js exists: $([ -f ws/playerHandler.js ] && echo YES || echo NO)"
echo "✓ ws/hostHandler.js exists: $([ -f ws/hostHandler.js ] && echo YES || echo NO)"
echo "✓ services/gameManager.js exists: $([ -f services/gameManager.js ] && echo YES || echo NO)"
echo "✓ middleware/profanityMiddleware.js exists: $([ -f middleware/profanityMiddleware.js ] && echo YES || echo NO)"
echo "✓ services/profanityService.js exists: $([ -f services/profanityService.js ] && echo YES || echo NO)"

# 4. Check which files were modified recently
echo -e "\n4️⃣ Recently modified files (last 2 hours):"
find . -name "*.js" -mmin -120 -type f | grep -v node_modules | head -20

# 5. Show file sizes to detect empty/corrupted files
echo -e "\n5️⃣ File sizes (checking for empty files):"
ls -la server.js routes/*.js services/*.js ws/*.js 2>/dev/null | grep -E "( 0 |server|Routes|Manager|Handler)"
