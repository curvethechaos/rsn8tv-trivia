#!/bin/bash
# test/test-profanity.sh - Test profanity filters using curl

BASE_URL="http://localhost:3000"
SESSION_ID="$1"

if [ -z "$SESSION_ID" ]; then
    echo "Creating a new test session..."
    RESPONSE=$(curl -s -X POST $BASE_URL/api/sessions/create \
        -H "Content-Type: application/json" \
        -d '{"hostId": "profanity-test-host"}')
    
    SESSION_ID=$(echo $RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)
    echo "Created session: $SESSION_ID"
fi

echo -e "\n🧪 Testing Profanity Filters for Session: $SESSION_ID\n"

# Join session first
echo "1️⃣ Joining session with clean nickname..."
curl -X POST $BASE_URL/api/sessions/$SESSION_ID/join \
    -H "Content-Type: application/json" \
    -d '{
        "playerId": "test-clean",
        "nickname": "CleanPlayer"
    }' | jq '.'

echo -e "\n2️⃣ Joining session with profane nickname..."
curl -X POST $BASE_URL/api/sessions/$SESSION_ID/join \
    -H "Content-Type: application/json" \
    -d '{
        "playerId": "test-profane",
        "nickname": "sh*tty_player"
    }' | jq '.'

# Test score submissions
echo -e "\n3️⃣ Testing score submission with clean data..."
curl -X POST $BASE_URL/api/sessions/$SESSION_ID/submit-score \
    -H "Content-Type: application/json" \
    -d '{
        "playerId": "test-clean",
        "score": 1000,
        "realName": "John Smith",
        "email": "john@example.com",
        "nickname": "JohnnyClean",
        "consent": true
    }' | jq '.'

echo -e "\n4️⃣ Testing score submission with profane nickname..."
curl -X POST $BASE_URL/api/sessions/$SESSION_ID/submit-score \
    -H "Content-Type: application/json" \
    -d '{
        "playerId": "test-profane",
        "score": 2000,
        "realName": "Jane Doe",
        "email": "jane@example.com",
        "nickname": "f*ck_this",
        "consent": true
    }' | jq '.'

echo -e "\n5️⃣ Testing score submission with profane real name..."
# First join with this player
curl -s -X POST $BASE_URL/api/sessions/$SESSION_ID/join \
    -H "Content-Type: application/json" \
    -d '{"playerId": "test-realname", "nickname": "TempName"}' > /dev/null

curl -X POST $BASE_URL/api/sessions/$SESSION_ID/submit-score \
    -H "Content-Type: application/json" \
    -d '{
        "playerId": "test-realname",
        "score": 3000,
        "realName": "Sh*t Johnson",
        "email": "test@example.com",
        "nickname": "NiceNickname",
        "consent": true
    }' | jq '.'

echo -e "\n✅ Profanity filter tests complete!"
echo -e "\nExpected results:"
echo "- Test 1 & 3: Should PASS (clean data)"
echo "- Test 2, 4 & 5: Should FAIL (profanity detected)"
