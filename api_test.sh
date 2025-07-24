#!/bin/bash

# RSN8TV API Test Script
# Tests all admin endpoints to verify they're working

API_BASE="https://trivia.rsn8tv.com/api"
USERNAME="axiom"
PASSWORD="HirschF843"

# Note: Nginx is configured to proxy /api/ requests to localhost:3000/api/

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 RSN8TV API Test Script"
echo "========================="
echo ""

# Step 1: Login to get auth token
echo "1. Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "'${USERNAME}'",
    "password": "'${PASSWORD}'"
  }')

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Login request failed${NC}"
  exit 1
fi

# Extract tokens using jq or grep
if command -v jq &> /dev/null; then
  AUTH_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken // .accessToken // .token // empty')
  REFRESH_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.refreshToken // .refreshToken // empty')
  SUCCESS=$(echo $LOGIN_RESPONSE | jq -r '.success // empty')
else
  # Fallback to grep if jq not installed
  AUTH_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  if [ -z "$AUTH_TOKEN" ]; then
    AUTH_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  fi
  SUCCESS=$(echo $LOGIN_RESPONSE | grep -o '"success":true')
fi

if [ -z "$AUTH_TOKEN" ] || [ -z "$SUCCESS" ]; then
  echo -e "${RED}❌ Login failed. Response:${NC}"
  echo $LOGIN_RESPONSE
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "   Token: ${AUTH_TOKEN:0:20}..."
echo ""

# Helper function to test endpoint
test_endpoint() {
  local method=$1
  local endpoint=$2
  local description=$3
  local data=$4
  
  echo -n "Testing $description... "
  
  if [ -z "$data" ]; then
    RESPONSE=$(curl -s -X $method "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -w "\n%{http_code}")
  else
    RESPONSE=$(curl -s -X $method "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data" \
      -w "\n%{http_code}")
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [[ $HTTP_CODE -ge 200 && $HTTP_CODE -lt 300 ]]; then
    echo -e "${GREEN}✅ ($HTTP_CODE)${NC}"
    
    # Check if response has data
    if command -v jq &> /dev/null; then
      HAS_DATA=$(echo $BODY | jq -r 'has("data") or has("success")' 2>/dev/null)
      if [ "$HAS_DATA" = "true" ]; then
        # Show sample of data
        SAMPLE=$(echo $BODY | jq -r 'if .data then (.data | if type == "array" then "[\(length) items]" else . end) else . end' 2>/dev/null | head -c 100)
        echo "   Response: $SAMPLE..."
      fi
    fi
  else
    echo -e "${RED}❌ ($HTTP_CODE)${NC}"
    echo "   Error: $BODY"
  fi
  echo ""
}

# Step 2: Test Admin Stats
echo "2. Testing Admin Routes"
echo "----------------------"
test_endpoint "GET" "/admin/stats" "Admin Stats"
test_endpoint "GET" "/admin/sessions?page=1&limit=10" "Sessions List"
test_endpoint "GET" "/admin/current-games" "Current Games"

# Step 3: Test Players
echo "3. Testing Player Routes"
echo "-----------------------"
test_endpoint "GET" "/admin/players?page=1&limit=10" "Players List"
test_endpoint "GET" "/players/1" "Get Player #1"

# Step 4: Test Leaderboards
echo "4. Testing Leaderboard Routes"
echo "-----------------------------"
test_endpoint "GET" "/leaderboards?period=weekly&limit=10" "Weekly Leaderboard"
test_endpoint "GET" "/leaderboards?period=monthly&limit=10" "Monthly Leaderboard"

# Step 5: Test Theme Routes
echo "5. Testing Theme Routes"
echo "----------------------"
test_endpoint "GET" "/admin/themes/current" "Get Current Theme"
test_endpoint "GET" "/admin/themes/preview/player" "Player Preview"

# Step 6: Test Branding Routes
echo "6. Testing Branding Routes"
echo "-------------------------"
test_endpoint "GET" "/admin/branding" "Get Branding"

# Step 7: Test Question Routes
echo "7. Testing Question Routes"
echo "-------------------------"
test_endpoint "GET" "/admin/questions?page=1&limit=10" "Questions List"
test_endpoint "GET" "/admin/questions/categories" "Question Categories"
test_endpoint "GET" "/admin/questions/csv-template" "CSV Template"

# Step 8: Test Prize Routes
echo "8. Testing Prize Routes"
echo "----------------------"
test_endpoint "GET" "/admin/prizes/time-based" "Time-based Prizes"
test_endpoint "GET" "/admin/prizes/threshold" "Threshold Prize"
test_endpoint "GET" "/admin/prizes/winners?period=weekly" "Prize Winners"

# Step 9: Test Export Routes
echo "9. Testing Export Routes"
echo "-----------------------"
test_endpoint "GET" "/admin/exports?page=1" "List Exports"
test_endpoint "POST" "/admin/exports" "Create Players Export" '{"type":"players","filters":{}}'

# Summary
echo ""
echo "=============================="
echo "Test Summary"
echo "=============================="
echo -e "${GREEN}✅ Tests completed${NC}"
echo ""
echo "Next steps if any tests failed:"
echo "1. Check PM2 logs: pm2 logs rsn8tv --lines 50"
echo "2. Check server health: curl http://localhost:3000/health | jq ."
echo "3. Verify services are initialized"
echo "4. Check database connectivity"
