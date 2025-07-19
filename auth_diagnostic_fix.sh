#!/bin/bash

# RSN8TV Auth Diagnostic and Fix Script
# This script diagnoses and fixes authentication issues

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔍 RSN8TV AUTH DIAGNOSTIC & FIX"
echo "================================"
echo ""

SERVER_DIR="/home/ubuntu/rsn8tv-trivia/trivia-server"
cd "$SERVER_DIR"

# Step 1: Check server logs for auth errors
echo -e "${YELLOW}Step 1: Checking recent server logs for errors...${NC}"
pm2 logs rsn8tv --lines 50 --nostream | grep -E "(Error|error:|TypeError|ReferenceError|Cannot)" | tail -20
echo ""

# Step 2: Check if auth routes are loaded
echo -e "${YELLOW}Step 2: Checking if auth routes file exists...${NC}"
if [ -f "routes/authRoutes.js" ]; then
    echo -e "${GREEN}✓ authRoutes.js exists${NC}"
    # Check if it exports properly
    if grep -q "module.exports" routes/authRoutes.js; then
        echo -e "${GREEN}✓ authRoutes.js has exports${NC}"
    else
        echo -e "${RED}✗ authRoutes.js missing exports${NC}"
    fi
else
    echo -e "${RED}✗ authRoutes.js is missing!${NC}"
fi

# Step 3: Check if authService exists and is properly instantiated
echo -e "\n${YELLOW}Step 3: Checking authService...${NC}"
if [ -f "services/authService.js" ]; then
    echo -e "${GREEN}✓ authService.js exists${NC}"
    
    # Check instantiation
    if grep -q "class AuthService" services/authService.js && ! grep -q "module.exports = new AuthService" services/authService.js; then
        echo -e "${YELLOW}⚠ AuthService needs instantiation fix${NC}"
        # Fix it
        sed -i 's/module.exports = AuthService;/module.exports = new AuthService();/g' services/authService.js
        echo -e "${GREEN}✓ Fixed AuthService instantiation${NC}"
    fi
else
    echo -e "${RED}✗ authService.js is missing!${NC}"
fi

# Step 4: Check database for admin_users table
echo -e "\n${YELLOW}Step 4: Checking admin_users table...${NC}"
ADMIN_COUNT=$(psql -U axiom -d rsn8tv_trivia -t -c "SELECT COUNT(*) FROM admin_users;" 2>/dev/null | tr -d ' ')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ admin_users table exists${NC}"
    echo "  Admin users in database: $ADMIN_COUNT"
    
    if [ "$ADMIN_COUNT" -eq "0" ]; then
        echo -e "${YELLOW}⚠ No admin users found! Creating default admin...${NC}"
        
        # Create admin user with bcrypt hash
        cat > /tmp/create_admin.js << 'EOF'
const bcrypt = require('bcryptjs');
const db = require('./db/connection');

async function createAdmin() {
    try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db('admin_users').insert({
            username: 'admin',
            email: 'admin@rsn8tv.com',
            password_hash: hashedPassword,
            role: 'admin',
            is_active: true
        });
        console.log('Admin user created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
EOF
        
        node /tmp/create_admin.js
        rm /tmp/create_admin.js
    fi
else
    echo -e "${RED}✗ admin_users table doesn't exist!${NC}"
    
    # Create the table
    echo "Creating admin_users table..."
    psql -U axiom -d rsn8tv_trivia << 'EOF'
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF
fi

# Step 5: Test auth endpoint directly
echo -e "\n${YELLOW}Step 5: Testing auth endpoint directly...${NC}"

# First check if server is listening
if ! netstat -tuln | grep -q ":3000"; then
    echo -e "${RED}✗ Server not listening on port 3000${NC}"
    echo "Restarting server..."
    pm2 restart rsn8tv
    sleep 5
fi

# Test the endpoint
echo "Testing POST /api/auth/login..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
    TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    if [ ! -z "$TOKEN" ]; then
        echo -e "${GREEN}✓ Auth is working! Token obtained.${NC}"
        echo "$TOKEN" > ~/.rsn8tv_token
    else
        echo -e "${RED}✗ Response doesn't contain accessToken${NC}"
    fi
elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${RED}✗ Auth route not found - checking route mounting${NC}"
    
    # Check if auth routes are mounted in server.js
    if ! grep -q "app.use('/api/auth'" server.js; then
        echo -e "${RED}✗ Auth routes not mounted in server.js${NC}"
        
        # Add auth route mounting
        sed -i "/\/\/ Route mounts/a app.use('/api/auth', authRoutes);" server.js
        echo -e "${GREEN}✓ Added auth route mounting${NC}"
        
        echo "Restarting server..."
        pm2 restart rsn8tv
        sleep 5
    fi
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${RED}✗ Server error - checking logs${NC}"
    pm2 logs rsn8tv --lines 20 --nostream | grep -A5 -B5 "auth"
else
    echo -e "${RED}✗ Unexpected response code: $HTTP_CODE${NC}"
fi

# Step 6: Check JWT environment variables
echo -e "\n${YELLOW}Step 6: Checking JWT configuration...${NC}"
if grep -q "JWT_SECRET=" .env && ! grep -q "JWT_SECRET=$" .env; then
    echo -e "${GREEN}✓ JWT_SECRET is configured${NC}"
else
    echo -e "${YELLOW}⚠ JWT_SECRET not configured, adding default...${NC}"
    echo "JWT_SECRET=your-secret-key-change-this-in-production" >> .env
    echo "JWT_REFRESH_SECRET=your-refresh-secret-change-this-in-production" >> .env
fi

# Step 7: Check bcryptjs installation
echo -e "\n${YELLOW}Step 7: Checking bcryptjs installation...${NC}"
if npm list bcryptjs &>/dev/null; then
    echo -e "${GREEN}✓ bcryptjs is installed${NC}"
else
    echo -e "${YELLOW}⚠ bcryptjs not installed, installing...${NC}"
    npm install bcryptjs
fi

# Step 8: Final comprehensive test
echo -e "\n${YELLOW}Step 8: Final comprehensive test...${NC}"

# Restart server with all fixes
echo "Restarting server with all fixes..."
pm2 restart rsn8tv
sleep 5

# Test again
echo "Testing authentication again..."
FINAL_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' 2>&1)

if echo "$FINAL_RESPONSE" | grep -q "accessToken"; then
    echo -e "${GREEN}✅ AUTHENTICATION FIXED!${NC}"
    TOKEN=$(echo "$FINAL_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "Token saved to ~/.rsn8tv_token"
    echo "$TOKEN" > ~/.rsn8tv_token
    
    # Test a protected endpoint
    echo -e "\nTesting protected endpoint with token..."
    curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/stats | head -20
else
    echo -e "${RED}✗ Authentication still failing${NC}"
    echo "Response: $FINAL_RESPONSE"
    echo ""
    echo -e "${YELLOW}Checking detailed server logs...${NC}"
    pm2 logs rsn8tv --lines 30 --nostream
fi

# Step 9: Create quick test script
echo -e "\n${YELLOW}Creating quick test script...${NC}"
cat > test_auth.sh << 'EOF'
#!/bin/bash
# Quick auth test script

echo "Testing RSN8TV Authentication..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}')

if echo "$RESPONSE" | grep -q "accessToken"; then
    echo "✓ Auth working!"
    TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "Token: ${TOKEN:0:20}..."
else
    echo "✗ Auth failed"
    echo "Response: $RESPONSE"
fi
EOF

chmod +x test_auth.sh
echo -e "${GREEN}✓ Created test_auth.sh for quick testing${NC}"

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}DIAGNOSTIC COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. If auth is still failing, check pm2 logs: pm2 logs rsn8tv -f"
echo "2. Run ./test_auth.sh to quickly test authentication"
echo "3. Check that admin user exists: psql -U axiom -d rsn8tv_trivia -c 'SELECT * FROM admin_users;'"
echo "4. Ensure all services are properly instantiated"
echo ""
echo "Common issues:"
echo "- Missing bcryptjs dependency"
echo "- AuthService not instantiated"
echo "- Auth routes not mounted"
echo "- No admin users in database"
echo "- JWT_SECRET not configured"
