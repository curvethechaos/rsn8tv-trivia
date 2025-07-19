#!/bin/bash

# Fix PrizeService Constructor Error
# This fixes the immediate issue preventing server startup

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔧 FIXING PRIZESERVICE CONSTRUCTOR ERROR"
echo "========================================"
echo ""

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Step 1: Check the error location
echo -e "${YELLOW}Step 1: Checking adminRoutes.js line 10...${NC}"
echo "Current line 10:"
sed -n '10p' routes/adminRoutes.js

# Step 2: Check how PrizeService is being imported
echo -e "\n${YELLOW}Step 2: Checking PrizeService import...${NC}"
grep -n "PrizeService" routes/adminRoutes.js | head -5

# Step 3: Fix the import/instantiation issue
echo -e "\n${YELLOW}Step 3: Fixing PrizeService instantiation in adminRoutes.js...${NC}"

# Check if it's trying to instantiate when it shouldn't
if grep -q "new PrizeService" routes/adminRoutes.js; then
    echo "Found 'new PrizeService' - removing 'new' keyword..."
    sed -i 's/new PrizeService()/PrizeService/g' routes/adminRoutes.js
    echo -e "${GREEN}✓ Fixed instantiation in adminRoutes.js${NC}"
fi

# Step 4: Check if prizeService.js is exporting an instance or class
echo -e "\n${YELLOW}Step 4: Checking prizeService.js export...${NC}"
if [ -f services/prizeService.js ]; then
    echo "Last line of prizeService.js:"
    tail -1 services/prizeService.js
    
    # If it's already exporting an instance, we need to update adminRoutes
    if grep -q "module.exports = new PrizeService()" services/prizeService.js; then
        echo -e "${GREEN}✓ prizeService.js is exporting an instance${NC}"
        
        # Update adminRoutes.js to just require it, not instantiate
        if grep -q "const PrizeService = require" routes/adminRoutes.js; then
            sed -i 's/const PrizeService = require/const prizeService = require/g' routes/adminRoutes.js
            sed -i 's/const prizeService = new PrizeService()/const prizeService = require("..\/services\/prizeService")/g' routes/adminRoutes.js
            echo -e "${GREEN}✓ Updated adminRoutes.js to use instance${NC}"
        fi
    fi
fi

# Step 5: Apply the same fix to all other services that might have the same issue
echo -e "\n${YELLOW}Step 5: Checking other services in adminRoutes.js...${NC}"

SERVICES=("QuestionService" "ThemeService" "BrandingService" "ExportService")
for service in "${SERVICES[@]}"; do
    service_lower=$(echo "$service" | sed 's/Service/Service/g' | awk '{print tolower(substr($0,1,1)) substr($0,2)}')
    
    if grep -q "new $service" routes/adminRoutes.js; then
        echo "Fixing $service..."
        sed -i "s/new $service()/${service_lower}/g" routes/adminRoutes.js
        sed -i "s/const $service = require/const ${service_lower} = require/g" routes/adminRoutes.js
        echo -e "${GREEN}✓ Fixed $service${NC}"
    fi
done

# Step 6: Show the updated imports section
echo -e "\n${YELLOW}Step 6: Updated imports in adminRoutes.js:${NC}"
head -20 routes/adminRoutes.js | grep -E "(require|const.*Service)"

# Step 7: Restart server and test
echo -e "\n${YELLOW}Step 7: Restarting server...${NC}"
pm2 restart rsn8tv
sleep 5

# Check if server is running
if pm2 list | grep -q "rsn8tv.*online"; then
    echo -e "${GREEN}✓ Server is running!${NC}"
    
    # Test auth endpoint
    echo -e "\n${YELLOW}Testing authentication...${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        if [ ! -z "$TOKEN" ]; then
            echo -e "${GREEN}✅ AUTHENTICATION IS WORKING!${NC}"
            echo "Token: ${TOKEN:0:50}..."
            echo "$TOKEN" > ~/.rsn8tv_token
            
            # Test a protected endpoint
            echo -e "\nTesting /api/admin/stats endpoint..."
            curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/stats | python3 -m json.tool | head -20
        fi
    else
        echo -e "${RED}Auth still failing. HTTP Code: $HTTP_CODE${NC}"
        echo "Response: $BODY"
    fi
else
    echo -e "${RED}✗ Server failed to start${NC}"
    echo "Checking error logs..."
    pm2 logs rsn8tv --err --lines 20 --nostream
fi

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}FIX COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"

# Final status check
pm2 status

echo -e "\nIf the server is still crashing, check:"
echo "1. pm2 logs rsn8tv --err"
echo "2. Ensure all services are properly exported"
echo "3. Check that adminRoutes.js imports match service exports"
