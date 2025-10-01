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
