#!/bin/bash

# GitHub update script - commit current working state

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "📦 GITHUB UPDATE SCRIPT"
echo "======================"
echo ""

cd /home/ubuntu/rsn8tv-trivia

# Step 1: Check git status
echo -e "${YELLOW}Step 1: Current git status${NC}"
git status --short

# Step 2: Create a comprehensive status file
echo -e "\n${YELLOW}Step 2: Creating project status file...${NC}"
cat > PROJECT_STATUS.md << 'EOF'
# RSN8TV Trivia System - Project Status
*Last Updated: $(date)*

## 🚀 Current Status: WORKING

### ✅ What's Working
- **Authentication**: JWT auth with axiom/HirschF843
- **Admin Dashboard**: https://trivia.rsn8tv.com/admin/monitoring/dashboard.html
- **Game Engine**: Real-time multiplayer trivia
- **Database**: PostgreSQL with all tables configured
- **Leaderboards**: Weekly/Monthly/Quarterly/Yearly with tie-breaking
- **WebSocket**: Real-time game communication
- **Host Display**: Tablet interface for venues
- **Player Interface**: Mobile-responsive gameplay

### ⚠️ Known Issues
- `/api/sessions` endpoint returns 404
- `/api/admin/questions` returns 500 (service method issue)
- `/api/admin/exports` list returns 500 (service method issue)
- Some admin dashboard tabs have limited functionality

### 📊 API Test Results
- Authentication: ✅ Working
- Admin Stats: ✅ Working
- Current Games: ✅ Working
- Players List: ✅ Working
- Leaderboards: ✅ Working
- Themes: ✅ Working
- Branding: ✅ Working
- Prizes: ✅ Working

### 🔧 Configuration
- **Backend**: Node.js + Express + Socket.IO
- **Database**: PostgreSQL (axiom/HirschF843)
- **Process Manager**: PM2 (process name: rsn8tv)
- **Web Server**: Nginx reverse proxy
- **Domain**: https://trivia.rsn8tv.com

### 📁 Key Files
- Backend: `~/rsn8tv-trivia/trivia-server/`
- Frontend: `/var/www/html/`
- Admin Dashboard: `/var/www/html/admin/monitoring/dashboard.html`
- Player App: `/var/www/html/trivia/index.html`
- Host Display: `/var/www/html/trivia/host.html`

### 🎮 How to Test
1. Host creates game: https://trivia.rsn8tv.com/trivia/host.html
2. Players join: https://trivia.rsn8tv.com/trivia/
3. Admin monitors: https://trivia.rsn8tv.com/admin/monitoring/dashboard.html

### ⚡ Quick Commands
\`\`\`bash
# Check server status
pm2 status

# View logs
pm2 logs rsn8tv -f

# Restart server
pm2 restart rsn8tv

# Run API tests
./api_test.sh

# Database access
psql -U axiom -d rsn8tv_trivia
\`\`\`

### 🚨 DO NOT
- Don't run random fix scripts without backups
- Don't change service instantiation patterns
- Don't modify working authentication
- The system is WORKING - be very careful with changes
EOF

# Step 3: Clean up unnecessary files
echo -e "\n${YELLOW}Step 3: Cleaning up temporary files...${NC}"
# Remove backup files but keep important ones
find . -name "*.backup_*" -mtime +1 -delete 2>/dev/null
find . -name "*.bak" -mtime +1 -delete 2>/dev/null
rm -f trivia-server/test_services.js 2>/dev/null
rm -f trivia-server/create_admin.js 2>/dev/null
rm -f trivia-server/server_minimal.js 2>/dev/null

# Step 4: Update .gitignore
echo -e "\n${YELLOW}Step 4: Updating .gitignore...${NC}"
cat >> .gitignore << 'EOF'

# Backup files
*.backup*
*.bak
server.js.broken

# Test files
test_*.js
*_test.sh

# Temporary files
*.tmp
/tmp/

# Log files
*.log
logs/

# PM2
.pm2/

# Environment
.env
.env.local
.env.*.local

# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo
*~
EOF

# Step 5: Add all files
echo -e "\n${YELLOW}Step 5: Adding files to git...${NC}"
git add -A

# Step 6: Show what will be committed
echo -e "\n${YELLOW}Step 6: Files to be committed:${NC}"
git status --short

# Step 7: Commit
echo -e "\n${YELLOW}Step 7: Creating commit...${NC}"
COMMIT_MSG="Update working state - Dashboard functional, Auth working, Most APIs operational

Current status:
- Admin dashboard loading correctly
- Authentication working (axiom/HirschF843)
- Most API endpoints functional
- Game engine operational
- Known issues documented in PROJECT_STATUS.md"

git commit -m "$COMMIT_MSG"

# Step 8: Push to GitHub
echo -e "\n${YELLOW}Step 8: Pushing to GitHub...${NC}"
git push origin main

echo -e "\n${GREEN}✅ GITHUB UPDATE COMPLETE${NC}"
echo ""
echo -e "${BLUE}Repository updated at:${NC} https://github.com/curvethechaos/rsn8tv-trivia"
echo -e "${BLUE}Current branch:${NC} main"
echo -e "${BLUE}Working dashboard:${NC} https://trivia.rsn8tv.com/admin/monitoring/dashboard.html"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Check GitHub to confirm update"
echo "2. Create a backup tag: git tag -a v1.0-working -m 'Working version with dashboard'"
echo "3. Push tag: git push origin v1.0-working"
