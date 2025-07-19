#!/bin/bash

# Test admin dashboard functionality

echo "🎯 TESTING ADMIN DASHBOARD"
echo "========================="
echo ""

# First get a valid token
echo "Getting auth token..."
TOKEN=$(curl -s -X POST https://trivia.rsn8tv.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"axiom","password":"HirschF843"}' | \
    grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get auth token"
    exit 1
fi

echo "✅ Got token: ${TOKEN:0:50}..."
echo "$TOKEN" > ~/.rsn8tv_token

# Test each admin endpoint that the dashboard uses
echo -e "\n📊 Testing Dashboard API Endpoints:"
echo "===================================="

endpoints=(
    "/api/admin/stats"
    "/api/admin/questions?page=1&limit=20"
    "/api/admin/themes"
    "/api/admin/branding"
    "/api/admin/prizes/time-based"
    "/api/admin/prizes/threshold"
    "/api/admin/exports"
    "/api/leaderboards?period=weekly"
    "/api/sessions"
)

for endpoint in "${endpoints[@]}"; do
    echo -e "\n📍 Testing $endpoint"
    RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        "https://trivia.rsn8tv.com$endpoint")
    
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Status: 200 OK"
        echo "$BODY" | python3 -m json.tool 2>/dev/null | head -10 || echo "$BODY" | head -50
    else
        echo "❌ Status: $HTTP_CODE"
        echo "$BODY"
    fi
done

# Check if dashboard HTML is accessible
echo -e "\n📄 Testing Dashboard HTML:"
echo "=========================="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://trivia.rsn8tv.com/admin/monitoring/dashboard.html)
echo "Dashboard HTML status: $HTTP_CODE"

# Check for common issues
echo -e "\n🔍 Checking for Common Issues:"
echo "=============================="

# Check if tab JavaScript files exist
echo -n "Checking tab modules... "
TAB_COUNT=$(curl -s https://trivia.rsn8tv.com/admin/monitoring/dashboard.html | grep -c "tabs/.*/tab.js" || echo "0")
echo "Found $TAB_COUNT tab references"

# Check console errors
echo -e "\n💡 To check browser console errors:"
echo "1. Open https://trivia.rsn8tv.com/admin/monitoring/dashboard.html"
echo "2. Login with: axiom / HirschF843"
echo "3. Open browser DevTools (F12)"
echo "4. Check Console tab for errors"
echo "5. Check Network tab for failed requests"

echo -e "\n✅ API endpoints are being tested above."
echo "If they return data but dashboard is empty, the issue is likely:"
echo "- JavaScript errors in the browser"
echo "- Tab modules not loading correctly"
echo "- API base URL mismatch in frontend code"
