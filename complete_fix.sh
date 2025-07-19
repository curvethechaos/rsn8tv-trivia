#!/bin/bash

# Complete final fix for all issues

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🎯 COMPLETE FINAL FIX"
echo "===================="
echo ""

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Step 1: Fix the brandingService line
echo -e "${YELLOW}Step 1: Fixing brandingService assignment...${NC}"
echo "Current line 57:"
sed -n '57p' server.js

# Fix it
sed -i 's/const brandingService = BrandingService;/const brandingService = require(".\/services\/brandingService");/g' server.js

echo "Fixed to:"
sed -n '57p' server.js
echo -e "${GREEN}✓ Fixed brandingService${NC}"

# Step 2: Check for any remaining issues
echo -e "\n${YELLOW}Step 2: Checking for any other service issues...${NC}"
grep -n "Service" server.js | grep -v "require" | grep -v "//" | grep -E "(new|=.*Service[^s])"

# Step 3: Also check serviceWrappers line
echo -e "\n${YELLOW}Step 3: Checking serviceWrappers usage...${NC}"
if grep -q "serviceWrappers" server.js; then
    echo "Found serviceWrappers references:"
    grep -n "serviceWrappers" server.js
    
    # Comment out any Object.assign with serviceWrappers
    sed -i '/Object.assign.*serviceWrapper/s/^/\/\/ /' server.js
    echo -e "${GREEN}✓ Disabled serviceWrapper assignments${NC}"
fi

# Step 4: Ensure ProfanityService is handled correctly
echo -e "\n${YELLOW}Step 4: Checking ProfanityService...${NC}"
if grep -q "new ProfanityService()" server.js; then
    # Check if ProfanityService exports an instance or class
    if grep -q "module.exports = new ProfanityService" services/profanityService.js 2>/dev/null; then
        sed -i 's/const profanityService = new ProfanityService();/const profanityService = require(".\/services\/profanityService");/g' server.js
        echo -e "${GREEN}✓ Fixed ProfanityService to use instance${NC}"
    else
        echo -e "${YELLOW}ProfanityService exports a class, keeping new${NC}"
    fi
fi

# Step 5: Restart server
echo -e "\n${YELLOW}Step 5: Restarting server...${NC}"
pm2 restart rsn8tv
sleep 5

# Step 6: Check if it's stable
echo -e "\n${YELLOW}Step 6: Checking server stability...${NC}"
RESTART_COUNT_1=$(pm2 describe rsn8tv 2>/dev/null | grep "restart time" | awk '{print $4}')
sleep 5
RESTART_COUNT_2=$(pm2 describe rsn8tv 2>/dev/null | grep "restart time" | awk '{print $4}')

if [ "$RESTART_COUNT_1" = "$RESTART_COUNT_2" ]; then
    echo -e "${GREEN}✓ Server is stable (no restarts in 5 seconds)${NC}"
    
    # Test endpoints using HTTPS through nginx
    echo -e "\n${YELLOW}Testing via HTTPS (nginx proxy)...${NC}"
    
    # Test auth endpoint
    echo "Testing authentication..."
    RESPONSE=$(curl -s -X POST https://trivia.rsn8tv.com/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    
    if echo "$RESPONSE" | grep -q "accessToken"; then
        echo -e "${GREEN}✅ AUTHENTICATION WORKING VIA HTTPS!${NC}"
        TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        echo "$TOKEN" > ~/.rsn8tv_token
        echo "Token: ${TOKEN:0:50}..."
        
        # Test admin stats
        echo -e "\nTesting /api/admin/stats via HTTPS..."
        STATS=$(curl -s -H "Authorization: Bearer $TOKEN" https://trivia.rsn8tv.com/api/admin/stats)
        echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
        
        # Run full test suite
        echo -e "\n${GREEN}Running full API test suite...${NC}"
        cd /home/ubuntu/rsn8tv-trivia
        ./api_test.sh
    else
        echo -e "${RED}✗ Auth failed via HTTPS${NC}"
        echo "Response: $RESPONSE"
        
        # Try localhost as fallback
        echo -e "\nTrying localhost..."
        RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
            -H "Content-Type: application/json" \
            -d '{"username":"admin","password":"admin123"}')
        
        if echo "$RESPONSE" | grep -q "accessToken"; then
            echo -e "${YELLOW}✓ Auth works on localhost but not via nginx${NC}"
            echo "Check nginx configuration"
        else
            echo -e "${RED}✗ Auth not working at all${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Server is still crashing (restarts: $RESTART_COUNT_1 → $RESTART_COUNT_2)${NC}"
    echo -e "\nChecking error logs..."
    pm2 logs rsn8tv --err --lines 30 --nostream
fi

# Step 7: Final status
echo -e "\n${YELLOW}Final PM2 Status:${NC}"
pm2 status

# Step 8: Check nginx is properly configured
echo -e "\n${YELLOW}Checking nginx configuration:${NC}"
if grep -q "proxy_pass.*localhost:3000" /etc/nginx/sites-enabled/trivia.rsn8tv.com 2>/dev/null; then
    echo -e "${GREEN}✓ Nginx is configured to proxy to port 3000${NC}"
else
    echo -e "${YELLOW}⚠ Check nginx configuration${NC}"
fi

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$RESTART_COUNT_1" = "$RESTART_COUNT_2" ]; then
    echo -e "\n${GREEN}✅ Server is running and stable!${NC}"
    echo "Access the API at: https://trivia.rsn8tv.com/api"
    echo "Admin dashboard at: https://trivia.rsn8tv.com/admin/monitoring/dashboard.html"
else
    echo -e "\n${RED}Server is still having issues. Next steps:${NC}"
    echo "1. Check the specific error: pm2 logs rsn8tv --err"
    echo "2. Look at line numbers mentioned in errors"
    echo "3. Ensure all services are properly exported"
fi
