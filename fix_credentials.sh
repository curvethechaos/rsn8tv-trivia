#!/bin/bash

# Update API test script with correct credentials

echo "🔧 FIXING API TEST SCRIPT"
echo "========================"
echo ""

# Update the api_test.sh file
cd /home/ubuntu/rsn8tv-trivia

# Backup original
cp api_test.sh api_test.sh.backup

# Replace admin/admin123 with axiom/HirschF843
sed -i 's/"username":"admin"/"username":"axiom"/g' api_test.sh
sed -i 's/"password":"admin123"/"password":"HirschF843"/g' api_test.sh

echo "✓ Updated api_test.sh with correct credentials"

# Also update any other test scripts
if [ -f test_auth.sh ]; then
    sed -i 's/"username":"admin"/"username":"axiom"/g' test_auth.sh
    sed -i 's/"password":"admin123"/"password":"HirschF843"/g' test_auth.sh
    echo "✓ Updated test_auth.sh"
fi

# Test authentication with correct credentials
echo -e "\nTesting authentication with correct credentials..."
RESPONSE=$(curl -s -X POST https://trivia.rsn8tv.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"axiom","password":"HirschF843"}')

if echo "$RESPONSE" | grep -q "accessToken"; then
    echo -e "\033[0;32m✅ AUTHENTICATION SUCCESSFUL!\033[0m"
    TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "$TOKEN" > ~/.rsn8tv_token
    echo "Token saved!"
    
    # Test admin endpoints
    echo -e "\nTesting admin endpoints..."
    
    echo -e "\n1. /api/admin/stats:"
    curl -s -H "Authorization: Bearer $TOKEN" https://trivia.rsn8tv.com/api/admin/stats | python3 -m json.tool
    
    echo -e "\n2. /api/admin/questions:"
    curl -s -H "Authorization: Bearer $TOKEN" https://trivia.rsn8tv.com/api/admin/questions | python3 -m json.tool | head -20
    
    echo -e "\n3. /api/admin/prizes/time-based:"
    curl -s -H "Authorization: Bearer $TOKEN" https://trivia.rsn8tv.com/api/admin/prizes/time-based | python3 -m json.tool
    
    # Run full test suite
    echo -e "\n\033[1;33mRunning full API test suite...\033[0m"
    ./api_test.sh
else
    echo -e "\033[0;31m✗ Authentication failed\033[0m"
    echo "Response: $RESPONSE"
fi

echo -e "\n========================================="
echo "CREDENTIALS FOR ALL TESTING:"
echo "Username: axiom"
echo "Password: HirschF843"
echo "========================================="
