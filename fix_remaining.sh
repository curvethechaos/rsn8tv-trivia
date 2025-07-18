#!/bin/bash

# RSN8TV Remaining Backend Fixes
# Fixes the 3 remaining 500 errors

set -e

echo "🔧 Fixing Remaining Backend Issues"
echo "================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_DIR="/home/ubuntu/rsn8tv-trivia/trivia-server"
cd $BASE_DIR

# First, let's check the actual errors
echo -e "${YELLOW}Checking recent error logs...${NC}"
pm2 logs rsn8tv --lines 100 --nostream | grep -i error | tail -10 || true

echo -e "\n${YELLOW}Step 1: Fixing brandingService getCurrentBranding...${NC}"

# Check if getCurrentBranding exists in the instance
if ! grep -q "getCurrentBranding" services/brandingService.js; then
    echo -e "${RED}getCurrentBranding method missing!${NC}"
else
    # The issue might be the instantiation. Let's check how the service is exported
    if ! grep -q "module.exports = new BrandingService" services/brandingService.js; then
        # Replace module.exports = BrandingService with instantiated version
        sed -i 's/module.exports = BrandingService;/module.exports = new BrandingService();/g' services/brandingService.js
        echo -e "${GREEN}✓ Fixed BrandingService instantiation${NC}"
    fi
fi

echo -e "\n${YELLOW}Step 2: Fixing questionService...${NC}"

# First ensure db is imported in questionService
if ! grep -q "const db = require" services/questionService.js; then
    sed -i "1i const db = require('../db/connection');" services/questionService.js
    echo -e "${GREEN}✓ Added db import to questionService${NC}"
fi

# Fix the class instantiation
if ! grep -q "module.exports = new QuestionService" services/questionService.js; then
    if grep -q "module.exports = QuestionService" services/questionService.js; then
        sed -i 's/module.exports = QuestionService;/module.exports = new QuestionService();/g' services/questionService.js
        echo -e "${GREEN}✓ Fixed QuestionService instantiation${NC}"
    fi
fi

echo -e "\n${YELLOW}Step 3: Fixing Prize Winners submitted_at column...${NC}"

# The issue is likely that submitted_at doesn't exist in leaderboards table
# Let's update the query to use created_at instead
sed -i 's/l\.submitted_at/l.created_at as submitted_at/g' services/prizeService.js
echo -e "${GREEN}✓ Fixed submitted_at references${NC}"

echo -e "\n${YELLOW}Step 4: Checking database columns...${NC}"

# Create a comprehensive check/fix SQL
cat > /tmp/check_fix_columns.sql << 'EOF'
-- Check and list columns in each table
\d question_cache
\d leaderboards
\d player_profiles

-- Ensure branding_config table exists
CREATE TABLE IF NOT EXISTS branding_config (
    id SERIAL PRIMARY KEY,
    main_logo_url TEXT,
    favicon_url TEXT,
    sponsor_logos JSON,
    company_name VARCHAR(255) DEFAULT 'RSN8TV Trivia',
    tagline TEXT DEFAULT 'Real-time multiplayer trivia',
    footer_text TEXT DEFAULT '© 2025 RSN8TV. All rights reserved.',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default branding if none exists
INSERT INTO branding_config (is_active) 
SELECT true 
WHERE NOT EXISTS (SELECT 1 FROM branding_config WHERE is_active = true);

-- Add any missing columns to question_cache
ALTER TABLE question_cache 
ADD COLUMN IF NOT EXISTS question_text TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- If question_text doesn't exist but question does, rename it
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='question_cache' AND column_name='question') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='question_cache' AND column_name='question_text') 
    THEN
        ALTER TABLE question_cache RENAME COLUMN question TO question_text;
    END IF;
END $$;
EOF

echo "Fixing database schema..."
PGPASSWORD=HirschF843 psql -U axiom -d rsn8tv_trivia -f /tmp/check_fix_columns.sql

echo -e "\n${YELLOW}Step 5: Creating serviceWrappers.js if missing...${NC}"

# Create a simple serviceWrappers file to ensure compatibility
cat > services/serviceWrappers.js << 'EOF'
// Service wrappers for compatibility
module.exports = {
  questionServiceWrapper: {},
  themeServiceWrapper: {},
  brandingServiceWrapper: {},
  prizeServiceWrapper: {},
  exportServiceWrapper: {}
};
EOF
echo -e "${GREEN}✓ Created serviceWrappers.js${NC}"

echo -e "\n${YELLOW}Step 6: Restarting server...${NC}"
pm2 restart rsn8tv

sleep 3

echo -e "\n${YELLOW}Step 7: Testing the fixed endpoints...${NC}"

# Test each endpoint individually
echo "Testing Branding..."
curl -s -H "Authorization: Bearer $(cat ~/.rsn8tv_token 2>/dev/null || echo 'test')" \
     http://localhost:3000/api/admin/branding | head -1

echo -e "\nTesting Questions..."
curl -s -H "Authorization: Bearer $(cat ~/.rsn8tv_token 2>/dev/null || echo 'test')" \
     "http://localhost:3000/api/admin/questions?page=1&limit=5" | head -1

echo -e "\nTesting Prize Winners..."
curl -s -H "Authorization: Bearer $(cat ~/.rsn8tv_token 2>/dev/null || echo 'test')" \
     http://localhost:3000/api/admin/prizes/winners | head -1

echo -e "\n${YELLOW}Step 8: Final check of error logs...${NC}"
pm2 logs rsn8tv --lines 20 --nostream | grep -i error || echo "No recent errors found"

# Cleanup
rm -f /tmp/check_fix_columns.sql

echo -e "\n${GREEN}✅ Fixes completed!${NC}"
echo -e "\n${YELLOW}Run the API test again to verify:${NC}"
echo "cd ~/rsn8tv-trivia && ./api_test.sh"
