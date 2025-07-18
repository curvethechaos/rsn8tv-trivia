#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧹 RSN8TV Trivia - Reset and Host Setup${NC}"
echo "======================================"

# Load environment variables
SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/.env"

# 1. Clean database
echo -e "${YELLOW}1. Cleaning database...${NC}"
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -h $DB_HOST -c "
-- First delete players from sessions where no one has registered
DELETE FROM players WHERE session_id IN (
    SELECT s.id FROM sessions s 
    WHERE NOT EXISTS (
        SELECT 1 FROM scores sc 
        JOIN player_profiles pp ON pp.id = sc.player_profile_id 
        WHERE sc.session_id = s.id
    )
);
-- Then delete sessions where no one has registered
DELETE FROM sessions WHERE id IN (
    SELECT s.id FROM sessions s 
    WHERE NOT EXISTS (
        SELECT 1 FROM scores sc 
        JOIN player_profiles pp ON pp.id = sc.player_profile_id 
        WHERE sc.session_id = s.id
    )
);" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database cleaned${NC}"
else
    echo -e "${RED}❌ Failed to clean database${NC}"
    exit 1
fi

# 2. Restart backend
echo -e "${YELLOW}2. Restarting backend...${NC}"
pm2 restart rsn8tv-backend > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend restarted${NC}"
else
    echo -e "${RED}❌ Failed to restart backend${NC}"
    exit 1
fi

# 3. Wait for server to be ready
echo -e "${YELLOW}3. Waiting for server to be ready...${NC}"
sleep 3

# Check if server is responding
curl -s http://localhost:3000/health > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server is ready${NC}"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    exit 1
fi

# 4. Show instructions
echo ""
echo -e "${GREEN}✅ System reset complete!${NC}"
echo "======================================"
echo ""
echo -e "${YELLOW}📺 Open the Host Display at:${NC}"
echo -e "${GREEN}   https://trivia.rsn8tv.com/host.html${NC}"
echo ""
echo -e "${YELLOW}The host display will:${NC}"
echo "  - Create a new session automatically"
echo "  - Show QR code for players to join"
echo "  - Display game progress in real-time"
