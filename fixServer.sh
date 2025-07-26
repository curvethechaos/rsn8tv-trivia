#!/bin/bash

# Quick fix for authMiddleware error

echo "========================================="
echo "EMERGENCY FIX: authMiddleware Error"
echo "========================================="
echo ""

echo "Step 1: Fixing authMiddleware reference..."
echo "-----------------------------------------"

cd ~/rsn8tv-trivia/trivia-server/routes

# Fix the authMiddleware reference to use authenticateToken
sed -i 's/authMiddleware/authenticateToken/g' adminRoutes.js

echo "Fixed authMiddleware references"

echo ""
echo "Step 2: Verifying the fix..."
echo "----------------------------"

# Check what middleware is actually imported
echo "Checking imports:"
grep -E "require.*auth|authenticateToken" adminRoutes.js | head -5

echo ""
echo "Checking usage:"
grep -n "authenticateToken\|authMiddleware" adminRoutes.js | head -10

echo ""
echo "Step 3: Restarting server..."
echo "----------------------------"

pm2 restart rsn8tv

sleep 3

echo ""
echo "Step 4: Checking if server is running..."
echo "----------------------------------------"

pm2 list

echo ""
echo "Step 5: Checking for errors..."
echo "-----------------------------"

pm2 logs rsn8tv --lines 10 --nostream | grep -E "Server running|connected|error|Error"

echo ""
echo "Step 6: Testing API..."
echo "---------------------"

# Test auth endpoint
response=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "axiom", "password": "HirschF843"}' 2>&1)

if echo "$response" | grep -q "accessToken"; then
    echo "✅ API is working!"
    echo "$response" | python3 -m json.tool | head -5
    
    # Test the admin dashboard
    echo ""
    echo "Testing admin endpoints..."
    TOKEN=$(echo "$response" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    
    echo "Stats endpoint:"
    curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/stats | python3 -m json.tool | head -10
    
    echo ""
    echo "Players endpoint:"
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/admin/players?limit=2" | python3 -m json.tool | head -20
else
    echo "❌ API still not working"
    echo "Response: $response"
    
    echo ""
    echo "Checking server logs for the actual error:"
    pm2 logs rsn8tv --lines 30 --nostream
fi

echo ""
echo "========================================="
echo "If this doesn't work, we'll roll back"
echo "========================================="
