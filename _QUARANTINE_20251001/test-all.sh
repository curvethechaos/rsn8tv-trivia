#!/bin/bash
# RSN8TV Trivia - Complete Endpoint Testing Script
# Based on actual API documentation from DB + Endpoints.docx

echo "=================================================="
echo "RSN8TV TRIVIA - COMPLETE ENDPOINT VERIFICATION"
echo "=================================================="
echo ""

# Configuration
BASE_URL="http://localhost:3000"
API_BASE="$BASE_URL/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Authentication token (will be set after login)
AUTH_TOKEN=""

# Test helper function
test_endpoint() {
  local METHOD=$1
  local ENDPOINT=$2
  local DESCRIPTION=$3
  local DATA=$4
  local REQUIRES_AUTH=$5
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  printf "${BLUE}Testing:${NC} %-50s " "$DESCRIPTION"
  
  # Build curl command
  CURL_CMD="curl -s -w '\n%{http_code}' -X $METHOD"
  
  # Add auth header if required
  if [ "$REQUIRES_AUTH" = "true" ] && [ -n "$AUTH_TOKEN" ]; then
    CURL_CMD="$CURL_CMD -H 'Authorization: Bearer $AUTH_TOKEN'"
  fi
  
  # Add content-type for POST/PUT
  if [ "$METHOD" = "POST" ] || [ "$METHOD" = "PUT" ]; then
    CURL_CMD="$CURL_CMD -H 'Content-Type: application/json'"
  fi
  
  # Add data if provided
  if [ -n "$DATA" ]; then
    CURL_CMD="$CURL_CMD -d '$DATA'"
  fi
  
  # Execute request
  CURL_CMD="$CURL_CMD '$API_BASE$ENDPOINT'"
  RESPONSE=$(eval $CURL_CMD)
  
  # Extract status code (last line)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)
  
  # Check if successful (2xx or 3xx)
  if [[ $HTTP_CODE -ge 200 && $HTTP_CODE -lt 400 ]]; then
    echo -e "${GREEN}✅ ($HTTP_CODE)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    
    # Show sample response for important endpoints
    if [[ "$DESCRIPTION" == *"Login"* ]] || [[ "$DESCRIPTION" == *"Stats"* ]]; then
      SAMPLE=$(echo "$BODY" | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps(data, indent=2)[:200])" 2>/dev/null || echo "$BODY" | head -c 100)
      echo "   Sample: $SAMPLE..."
    fi
  else
    echo -e "${RED}❌ ($HTTP_CODE)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    ERROR_MSG=$(echo "$BODY" | head -c 100)
    echo "   Error: $ERROR_MSG"
  fi
}

# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================
echo ""
echo "======================================"
echo "1. AUTHENTICATION ENDPOINTS"
echo "======================================"

# Login
test_endpoint "POST" "/auth/login" "Admin Login" '{"username":"axiom","password":"HirschF843"}' false

# Extract token from response
AUTH_TOKEN=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"axiom","password":"HirschF843"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -n "$AUTH_TOKEN" ]; then
  echo -e "${GREEN}✅ Authentication token obtained${NC}"
else
  echo -e "${RED}❌ Failed to obtain auth token - remaining tests may fail${NC}"
fi

test_endpoint "GET" "/auth/me" "Get Current User" "" true
test_endpoint "POST" "/auth/refresh" "Refresh Token" '{"refreshToken":"dummy"}' false

# =============================================================================
# SESSION MANAGEMENT TESTS
# =============================================================================
echo ""
echo "======================================"
echo "2. SESSION MANAGEMENT ENDPOINTS"
echo "======================================"

test_endpoint "POST" "/sessions/create" "Create Session" '{"hostDeviceId":"test-device","venueName":"Test Venue"}' false
test_endpoint "GET" "/sessions/test-session-id/questions" "Get Session Questions" "" false
test_endpoint "POST" "/sessions/test-session-id/join" "Join Session" '{"temporaryName":"TestPlayer","clientId":"test-client-123"}' false
test_endpoint "POST" "/sessions/test-session-id/submit-score" "Submit Score" '{"playerId":1,"score":1500,"answers":[]}' false

# =============================================================================
# PLAYER MANAGEMENT TESTS
# =============================================================================
echo ""
echo "======================================"
echo "3. PLAYER MANAGEMENT ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/players/1" "Get Player Profile" "" false
test_endpoint "PUT" "/players/1" "Update Player Profile" '{"nickname":"NewNick"}' false
test_endpoint "GET" "/players/1/history" "Get Player History" "" false
test_endpoint "GET" "/players/1/achievements" "Get Player Achievements" "" false
test_endpoint "GET" "/players/session/test-session-id" "Get Session Players" "" false
test_endpoint "POST" "/players/check-email" "Check Email" '{"email":"test@example.com"}' false

# =============================================================================
# LEADERBOARD TESTS
# =============================================================================
echo ""
echo "======================================"
echo "4. LEADERBOARD ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/leaderboards?period=weekly&limit=10" "Weekly Leaderboard" "" false
test_endpoint "GET" "/leaderboards?period=monthly&limit=10" "Monthly Leaderboard" "" false
test_endpoint "GET" "/leaderboards?period=quarterly&limit=10" "Quarterly Leaderboard" "" false
test_endpoint "GET" "/leaderboards?period=yearly&limit=10" "Yearly Leaderboard" "" false
test_endpoint "GET" "/leaderboards/player/1" "Player Rankings" "" false

# =============================================================================
# ADMIN - GENERAL TESTS
# =============================================================================
echo ""
echo "======================================"
echo "5. ADMIN - GENERAL ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/stats" "Admin Stats" "" true
test_endpoint "GET" "/admin/sessions?page=1&limit=10" "Sessions List" "" true
test_endpoint "GET" "/admin/sessions?active=true" "Active Sessions" "" true
test_endpoint "GET" "/admin/players?page=1&limit=10" "Players List" "" true
test_endpoint "GET" "/admin/current-games" "Current Games" "" true

# =============================================================================
# ADMIN - THEME TESTS
# =============================================================================
echo ""
echo "======================================"
echo "6. ADMIN - THEME ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/themes/current" "Get Current Theme" "" true
test_endpoint "GET" "/admin/themes/preview/player" "Preview Player Theme" "" true
test_endpoint "GET" "/admin/themes/preview/host" "Preview Host Theme" "" true
test_endpoint "POST" "/admin/themes" "Save Theme" '{"name":"Test Theme","playerTheme":{},"hostTheme":{}}' true
test_endpoint "POST" "/admin/themes/reset" "Reset Theme" "" true

# =============================================================================
# ADMIN - BRANDING TESTS
# =============================================================================
echo ""
echo "======================================"
echo "7. ADMIN - BRANDING ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/branding" "Get Branding" "" true
test_endpoint "PUT" "/admin/branding" "Update Branding" '{"companyName":"RSN8TV","tagline":"Real-time Trivia"}' true

# Note: File upload endpoints (logo, favicon, sponsors) require multipart/form-data
echo -e "${YELLOW}⚠️  Skipping file upload tests (logo, favicon, sponsors)${NC}"

# =============================================================================
# ADMIN - QUESTION TESTS
# =============================================================================
echo ""
echo "======================================"
echo "8. ADMIN - QUESTION ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/questions?page=1&limit=10" "List Questions" "" true
test_endpoint "GET" "/admin/questions/categories" "Get Categories" "" true
test_endpoint "GET" "/admin/questions/csv-template" "Get CSV Template" "" true
test_endpoint "GET" "/admin/questions/1" "Get Single Question" "" true
test_endpoint "GET" "/admin/questions/export" "Export Questions" "" true
test_endpoint "PUT" "/admin/questions/1" "Update Question" '{"question":"Updated?"}' true
test_endpoint "POST" "/admin/questions/1/flag" "Flag Question" '{"reason":"Incorrect answer"}' true

# =============================================================================
# ADMIN - PRIZE TESTS
# =============================================================================
echo ""
echo "======================================"
echo "9. ADMIN - PRIZE ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/prizes/time-based" "Get Time-Based Prizes" "" true
test_endpoint "GET" "/admin/prizes/threshold" "Get Threshold Prize" "" true
test_endpoint "GET" "/admin/prizes/winners?period=weekly" "Get Prize Winners" "" true
test_endpoint "GET" "/admin/prizes/statistics" "Get Prize Statistics" "" true
test_endpoint "POST" "/admin/prizes/time-based/weekly" "Update Weekly Prize" '{"description":"$100 Gift Card","enabled":true}' true
test_endpoint "POST" "/admin/prizes/threshold" "Update Threshold Prize" '{"minScore":8500,"description":"Bonus Prize"}' true

# =============================================================================
# ADMIN - EXPORT TESTS
# =============================================================================
echo ""
echo "======================================"
echo "10. ADMIN - EXPORT ENDPOINTS"
echo "======================================"

test_endpoint "GET" "/admin/exports?page=1" "List Exports" "" true
test_endpoint "POST" "/admin/exports" "Create Export" '{"type":"players","filters":{}}' true
test_endpoint "POST" "/admin/exports/estimate" "Estimate Export" '{"type":"players","filters":{}}' true

# Note: Download and delete require existing export IDs
echo -e "${YELLOW}⚠️  Skipping export download/delete (requires valid export ID)${NC}"

# =============================================================================
# HEALTH CHECK
# =============================================================================
echo ""
echo "======================================"
echo "11. HEALTH & STATUS"
echo "======================================"

printf "${BLUE}Testing:${NC} %-50s " "Server Health Check"
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok\|healthy\|status"; then
  echo -e "${GREEN}✅ Server is healthy${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ Server health check failed${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=================================================="
echo "TEST SUMMARY"
echo "=================================================="
echo -e "Total Tests:  ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
  exit 0
else
  PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
  echo -e "${YELLOW}⚠️  Pass Rate: $PASS_RATE%${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Check PM2 logs: pm2 logs rsn8tv --lines 50"
  echo "2. Check database: psql -U axiom -d rsn8tv_trivia"
  echo "3. Review failed endpoints above"
  exit 1
fi
