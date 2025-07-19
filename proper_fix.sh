#!/bin/bash

# Proper fix for service instantiation issues

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔧 PROPER SERVICE INSTANTIATION FIX"
echo "==================================="
echo ""

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Step 1: Check what's on line 53 of server.js
echo -e "${YELLOW}Step 1: Checking server.js line 53 (the error line)...${NC}"
echo "Line 53:"
sed -n '53p' server.js
echo ""

# Step 2: Check how services are being imported in server.js
echo -e "${YELLOW}Step 2: Checking service imports in server.js...${NC}"
echo "Service-related lines:"
grep -n "Service" server.js | grep -E "(require|new|const)" | head -20
echo ""

# Step 3: Fix all service instantiations in server.js
echo -e "${YELLOW}Step 3: Fixing service instantiations in server.js...${NC}"

# Create a backup
cp server.js server.js.backup_$(date +%Y%m%d_%H%M%S)

# Fix the pattern: change "new ServiceName()" to just require the service
# This works because the services export instances, not classes

# First, let's check if services are exporting instances
echo "Checking service exports:"
for service in exportService prizeService questionService themeService brandingService; do
    if [ -f "services/${service}.js" ]; then
        echo -n "${service}: "
        tail -1 "services/${service}.js" | grep -o "module.exports.*"
    fi
done
echo ""

# Now fix server.js
# Replace all "const serviceName = new ServiceName()" with "const serviceName = require('./services/serviceName')"
sed -i 's/const exportService = new ExportService()/const exportService = require(".\/services\/exportService")/g' server.js
sed -i 's/const prizeService = new PrizeService()/const prizeService = require(".\/services\/prizeService")/g' server.js
sed -i 's/const questionService = new QuestionService()/const questionService = require(".\/services\/questionService")/g' server.js
sed -i 's/const themeService = new ThemeService()/const themeService = require(".\/services\/themeService")/g' server.js
sed -i 's/const brandingService = new BrandingService()/const brandingService = require(".\/services\/brandingService")/g' server.js

# Also remove the redundant requires if they exist
sed -i '/const ExportService = require/d' server.js
sed -i '/const PrizeService = require/d' server.js
sed -i '/const QuestionService = require/d' server.js
sed -i '/const ThemeService = require/d' server.js
sed -i '/const BrandingService = require/d' server.js

echo -e "${GREEN}✓ Fixed service instantiations${NC}"

# Step 4: Ensure all services are properly exported as instances
echo -e "\n${YELLOW}Step 4: Ensuring services are exported as instances...${NC}"

for service in exportService prizeService questionService themeService brandingService; do
    service_file="services/${service}.js"
    if [ -f "$service_file" ]; then
        # Get the class name (capitalize first letter)
        class_name=$(echo "$service" | sed 's/Service$//' | sed 's/^./\U&/')Service
        
        # Check if it's exporting a class instead of an instance
        if grep -q "module.exports = ${class_name};" "$service_file"; then
            echo "Fixing ${service}..."
            sed -i "s/module.exports = ${class_name};/module.exports = new ${class_name}();/g" "$service_file"
            echo -e "${GREEN}✓ Fixed ${service} export${NC}"
        elif grep -q "module.exports = new ${class_name}()" "$service_file"; then
            echo -e "${GREEN}✓ ${service} already exports an instance${NC}"
        else
            echo -e "${YELLOW}⚠ ${service} has non-standard export${NC}"
        fi
    fi
done

# Step 5: Show the updated service section in server.js
echo -e "\n${YELLOW}Step 5: Updated service imports in server.js:${NC}"
grep -A5 -B5 "services" server.js | grep -E "(const.*Service|require.*service)"

# Step 6: Restart and test
echo -e "\n${YELLOW}Step 6: Restarting server...${NC}"
pm2 restart rsn8tv
sleep 5

# Check if it's actually running
if pm2 list | grep -q "rsn8tv.*online"; then
    RESTARTS=$(pm2 describe rsn8tv | grep "restart time" | awk '{print $4}')
    echo -e "${GREEN}✓ Server is online (restarts: $RESTARTS)${NC}"
    
    # Wait a bit more if it just restarted
    sleep 3
    
    # Test health endpoint
    echo -e "\nTesting health endpoint..."
    if curl -s http://localhost:3000/health | grep -q "healthy"; then
        echo -e "${GREEN}✓ Server is responding!${NC}"
        
        # Test auth
        echo -e "\nTesting authentication..."
        RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
            -H "Content-Type: application/json" \
            -d '{"username":"admin","password":"admin123"}')
        
        if echo "$RESPONSE" | grep -q "accessToken"; then
            echo -e "${GREEN}✅ AUTHENTICATION IS WORKING!${NC}"
            TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
            echo "$TOKEN" > ~/.rsn8tv_token
            echo "Token: ${TOKEN:0:50}..."
            
            # Test admin endpoint
            echo -e "\nTesting /api/admin/stats..."
            STATS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/stats)
            echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
            
            # Run full test suite
            echo -e "\n${YELLOW}Running full API test suite...${NC}"
            cd /home/ubuntu/rsn8tv-trivia
            ./api_test.sh
        else
            echo -e "${RED}✗ Authentication failed${NC}"
            echo "Response: $RESPONSE"
        fi
    else
        echo -e "${RED}✗ Server not responding to health check${NC}"
    fi
else
    echo -e "${RED}✗ Server crashed${NC}"
    echo "Checking error log..."
    pm2 logs rsn8tv --err --lines 20 --nostream
fi

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}FIX COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"

# Final check
pm2 status

echo -e "\nIf still having issues:"
echo "1. Check that all services in services/ directory export instances"
echo "2. Ensure server.js doesn't try to instantiate them with 'new'"
echo "3. Run: pm2 logs rsn8tv -f"
