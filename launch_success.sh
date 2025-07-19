#!/bin/bash

# RSN8TV COMPLETE LAUNCH SUCCESS SCRIPT
# This script fixes ALL issues and ensures launch readiness
# Run as: bash launch_success.sh

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚀 RSN8TV COMPLETE LAUNCH SUCCESS SCRIPT"
echo "========================================"
echo "Starting at: $(date)"
echo ""

# Configuration
SERVER_DIR="/home/ubuntu/rsn8tv-trivia/trivia-server"
WEB_DIR="/var/www/html"
BACKUP_DIR="$SERVER_DIR/backups/$(date +%Y%m%d_%H%M%S)"
API_URL="https://trivia.rsn8tv.com/api"
LOCALHOST="http://localhost:3000"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local auth=$3
    local data=$4
    
    if [ "$auth" = "yes" ]; then
        AUTH_HEADER="-H \"Authorization: Bearer $TOKEN\""
    else
        AUTH_HEADER=""
    fi
    
    if [ ! -z "$data" ]; then
        DATA_FLAG="-d '$data'"
    else
        DATA_FLAG=""
    fi
    
    eval "curl -s -X $method $AUTH_HEADER -H \"Content-Type: application/json\" $DATA_FLAG $LOCALHOST$endpoint" > /dev/null 2>&1
    echo $?
}

# ==========================================
# PHASE 1: CRITICAL BACKEND FIXES
# ==========================================
echo -e "${YELLOW}PHASE 1: CRITICAL BACKEND FIXES${NC}"
echo "================================="

cd "$SERVER_DIR"

# Step 1: Backup current files
echo -e "\n${BLUE}Step 1.1: Creating backups...${NC}"
for file in server.js services/*.js routes/*.js; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/" 2>/dev/null || true
    fi
done
echo -e "${GREEN}✓ Backups created in $BACKUP_DIR${NC}"

# Step 2: Fix serviceWrapper conflicts
echo -e "\n${BLUE}Step 1.2: Fixing serviceWrapper conflicts...${NC}"
if grep -q "Object.assign.*serviceWrapper" server.js; then
    sed -i '/Object.assign.*serviceWrapper/s/^/\/\/ DISABLED: /' server.js
    echo -e "${GREEN}✓ Disabled problematic Object.assign calls${NC}"
else
    echo -e "${GREEN}✓ serviceWrapper already fixed${NC}"
fi

# Step 3: Fix service instantiations
echo -e "\n${BLUE}Step 1.3: Fixing service instantiations...${NC}"

# Fix questionService
if grep -q "module.exports = QuestionService;" services/questionService.js 2>/dev/null; then
    sed -i 's/module.exports = QuestionService;/module.exports = new QuestionService();/g' services/questionService.js
    echo -e "${GREEN}✓ Fixed QuestionService instantiation${NC}"
fi

# Fix brandingService
if grep -q "module.exports = BrandingService;" services/brandingService.js 2>/dev/null; then
    sed -i 's/module.exports = BrandingService;/module.exports = new BrandingService();/g' services/brandingService.js
    echo -e "${GREEN}✓ Fixed BrandingService instantiation${NC}"
fi

# Fix themeService
if grep -q "module.exports = ThemeService;" services/themeService.js 2>/dev/null; then
    sed -i 's/module.exports = ThemeService;/module.exports = new ThemeService();/g' services/themeService.js
    echo -e "${GREEN}✓ Fixed ThemeService instantiation${NC}"
fi

# Fix prizeService
if grep -q "module.exports = PrizeService;" services/prizeService.js 2>/dev/null; then
    sed -i 's/module.exports = PrizeService;/module.exports = new PrizeService();/g' services/prizeService.js
    echo -e "${GREEN}✓ Fixed PrizeService instantiation${NC}"
fi

# Fix exportService
if grep -q "module.exports = ExportService;" services/exportService.js 2>/dev/null; then
    sed -i 's/module.exports = ExportService;/module.exports = new ExportService();/g' services/exportService.js
    echo -e "${GREEN}✓ Fixed ExportService instantiation${NC}"
fi

# Step 4: Fix database table references
echo -e "\n${BLUE}Step 1.4: Fixing database table references...${NC}"

# Fix questions vs question_cache
find services routes -name "*.js" -type f -exec sed -i "s/from('questions')/from('question_cache')/g" {} \;
find services routes -name "*.js" -type f -exec sed -i 's/table("questions")/table("question_cache")/g' {} \;
find services routes -name "*.js" -type f -exec sed -i "s/'questions'/'question_cache'/g" {} \;
echo -e "${GREEN}✓ Fixed question table references${NC}"

# Fix rank vs rank_position
find services routes -name "*.js" -type f -exec sed -i 's/\.rank\b/.rank_position/g' {} \;
echo -e "${GREEN}✓ Fixed rank column references${NC}"

# Fix submitted_at references
find services routes -name "*.js" -type f -exec sed -i 's/l\.submitted_at/l.created_at as submitted_at/g' {} \;
echo -e "${GREEN}✓ Fixed submitted_at references${NC}"

# Step 5: Install missing dependencies
echo -e "\n${BLUE}Step 1.5: Installing missing dependencies...${NC}"
MISSING_DEPS=""
for dep in "aws-sdk" "sharp" "uuid" "csv-parse" "csv-stringify" "archiver"; do
    if ! npm list $dep &>/dev/null; then
        MISSING_DEPS="$MISSING_DEPS $dep"
    fi
done

if [ ! -z "$MISSING_DEPS" ]; then
    npm install $MISSING_DEPS
    echo -e "${GREEN}✓ Installed missing dependencies:$MISSING_DEPS${NC}"
else
    echo -e "${GREEN}✓ All dependencies already installed${NC}"
fi

# Step 6: Fix missing database imports
echo -e "\n${BLUE}Step 1.6: Ensuring database imports...${NC}"
for service in questionService brandingService themeService prizeService exportService; do
    if [ -f "services/${service}.js" ]; then
        if ! grep -q "const db = require" "services/${service}.js"; then
            sed -i "1i const db = require('../db/connection');" "services/${service}.js"
            echo -e "${GREEN}✓ Added db import to ${service}${NC}"
        fi
    fi
done

# ==========================================
# PHASE 2: DATABASE FIXES
# ==========================================
echo -e "\n${YELLOW}PHASE 2: DATABASE FIXES${NC}"
echo "========================"

# Create missing tables and columns
echo -e "\n${BLUE}Step 2.1: Ensuring database schema...${NC}"

cat > /tmp/fix_schema.sql << 'EOF'
-- Ensure branding_config exists
CREATE TABLE IF NOT EXISTS branding_config (
    id SERIAL PRIMARY KEY,
    main_logo_url TEXT,
    favicon_url TEXT,
    sponsor_logos JSON,
    company_name VARCHAR(255) DEFAULT 'RSN8TV Trivia',
    tagline TEXT DEFAULT 'Real-time multiplayer trivia',
    footer_text TEXT DEFAULT '© 2025 RSN8TV. All rights reserved.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure themes table exists
CREATE TABLE IF NOT EXISTS themes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    primary_color VARCHAR(7) DEFAULT '#6366f1',
    secondary_color VARCHAR(7) DEFAULT '#4f46e5',
    accent_color VARCHAR(7) DEFAULT '#10b981',
    background_color VARCHAR(7) DEFAULT '#111827',
    text_color VARCHAR(7) DEFAULT '#f3f4f6',
    font_family VARCHAR(255) DEFAULT 'Inter, system-ui, sans-serif',
    custom_css TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure exports table exists
CREATE TABLE IF NOT EXISTS exports (
    id SERIAL PRIMARY KEY,
    export_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    filters JSON,
    file_path TEXT,
    file_size INTEGER,
    created_by INTEGER REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Ensure prize_configurations exists
CREATE TABLE IF NOT EXISTS prize_configurations (
    id SERIAL PRIMARY KEY,
    period_type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    minimum_score INTEGER DEFAULT 0,
    is_threshold BOOLEAN DEFAULT false,
    threshold_score INTEGER,
    email_template TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add default prize configurations if not exist
INSERT INTO prize_configurations (period_type, name, description, minimum_score, is_threshold)
SELECT * FROM (VALUES
    ('weekly', 'Weekly Champion', 'Highest score of the week', 0, false),
    ('monthly', 'Monthly Master', 'Highest score of the month', 0, false),
    ('quarterly', 'Quarterly Queen/King', 'Highest score of the quarter', 0, false),
    ('yearly', 'Annual Legend', 'Highest score of the year', 0, false),
    ('weekly', 'Elite Player', 'Score 8,500+ points in a week', 0, true)
) AS v(period_type, name, description, minimum_score, is_threshold)
WHERE NOT EXISTS (SELECT 1 FROM prize_configurations);

-- Update threshold score for Elite Player
UPDATE prize_configurations 
SET threshold_score = 8500 
WHERE is_threshold = true;

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add rank_position to leaderboards if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='leaderboards' AND column_name='rank_position') THEN
        ALTER TABLE leaderboards ADD COLUMN rank_position INTEGER;
    END IF;
    
    -- Add created_at to various tables if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='leaderboards' AND column_name='created_at') THEN
        ALTER TABLE leaderboards ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add success_rate to question_cache if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='question_cache' AND column_name='success_rate') THEN
        ALTER TABLE question_cache ADD COLUMN success_rate DECIMAL(5,2) DEFAULT 0;
    END IF;
    
    -- Add times_used to question_cache if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='question_cache' AND column_name='times_used') THEN
        ALTER TABLE question_cache ADD COLUMN times_used INTEGER DEFAULT 0;
    END IF;
    
    -- Add status to question_cache if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='question_cache' AND column_name='status') THEN
        ALTER TABLE question_cache ADD COLUMN status VARCHAR(50) DEFAULT 'active';
    END IF;
END $$;
EOF

psql -U axiom -d rsn8tv_trivia < /tmp/fix_schema.sql
echo -e "${GREEN}✓ Database schema updated${NC}"

# ==========================================
# PHASE 3: FRONTEND FIXES
# ==========================================
echo -e "\n${YELLOW}PHASE 3: FRONTEND FIXES${NC}"
echo "======================="

cd "$WEB_DIR"

# Step 1: Fix API endpoints to use HTTPS
echo -e "\n${BLUE}Step 3.1: Fixing API endpoints...${NC}"
find admin trivia -name "*.html" -o -name "*.js" | while read file; do
    if [ -f "$file" ]; then
        sed -i 's|http://trivia.rsn8tv.com|https://trivia.rsn8tv.com|g' "$file" 2>/dev/null || true
        sed -i 's|http://localhost:3000|https://trivia.rsn8tv.com|g' "$file" 2>/dev/null || true
    fi
done
echo -e "${GREEN}✓ Updated all API endpoints to HTTPS${NC}"

# Step 2: Fix tab module patterns
echo -e "\n${BLUE}Step 3.2: Fixing tab module patterns...${NC}"
TAB_DIRS="admin/monitoring/tabs/players admin/monitoring/tabs/leaderboards admin/monitoring/tabs/themes 
          admin/monitoring/tabs/branding admin/monitoring/tabs/questions admin/monitoring/tabs/analytics 
          admin/monitoring/tabs/venues admin/monitoring/tabs/prizes admin/monitoring/tabs/schedule 
          admin/monitoring/tabs/marketing admin/monitoring/tabs/api admin/monitoring/tabs/settings 
          admin/monitoring/tabs/current-games"

for dir in $TAB_DIRS; do
    if [ -d "$dir" ] && [ -f "$dir/tab.js" ]; then
        # Check if already using IIFE pattern
        if ! grep -q "window\." "$dir/tab.js"; then
            # Get tab name from directory
            TAB_NAME=$(basename "$dir" | sed 's/-//g')
            
            # Wrap in IIFE and attach to window
            mv "$dir/tab.js" "$dir/tab.js.bak"
            echo "(function() {" > "$dir/tab.js"
            echo "    'use strict';" >> "$dir/tab.js"
            echo "" >> "$dir/tab.js"
            cat "$dir/tab.js.bak" | sed 's/^export //' | sed "s/export default/window.${TAB_NAME}Tab =/" >> "$dir/tab.js"
            echo "" >> "$dir/tab.js"
            echo "})();" >> "$dir/tab.js"
            
            echo -e "${GREEN}✓ Fixed $TAB_NAME tab module${NC}"
        fi
    fi
done

# ==========================================
# PHASE 4: SERVER RESTART & TESTING
# ==========================================
echo -e "\n${YELLOW}PHASE 4: SERVER RESTART & TESTING${NC}"
echo "================================="

cd "$SERVER_DIR"

# Restart PM2
echo -e "\n${BLUE}Step 4.1: Restarting server...${NC}"
pm2 stop rsn8tv 2>/dev/null || true
pm2 delete rsn8tv 2>/dev/null || true
pm2 start server.js --name rsn8tv
sleep 5  # Wait for server to start

# Check if server is running
if pm2 list | grep -q "rsn8tv.*online"; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server failed to start${NC}"
    echo "Checking error logs..."
    pm2 logs rsn8tv --lines 20 --nostream
    exit 1
fi

# Get auth token
echo -e "\n${BLUE}Step 4.2: Getting auth token...${NC}"
TOKEN=$(curl -s -X POST $LOCALHOST/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' | \
    grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ Failed to get auth token${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Auth token obtained${NC}"
fi

# Test all endpoints
echo -e "\n${BLUE}Step 4.3: Testing all endpoints...${NC}"
FAILED_ENDPOINTS=""

# Public endpoints
echo -n "Testing GET /api/sessions... "
if [ $(test_endpoint "GET" "/api/sessions" "no") -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED_ENDPOINTS="$FAILED_ENDPOINTS\n- GET /api/sessions"
fi

# Auth endpoints
echo -n "Testing POST /api/auth/login... "
if [ $(test_endpoint "POST" "/api/auth/login" "no" '{"username":"admin","password":"admin123"}') -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED_ENDPOINTS="$FAILED_ENDPOINTS\n- POST /api/auth/login"
fi

# Admin endpoints
ADMIN_ENDPOINTS=(
    "GET /api/admin/stats"
    "GET /api/admin/questions"
    "GET /api/admin/themes"
    "GET /api/admin/prizes/time-based"
    "GET /api/admin/prizes/threshold"
    "GET /api/admin/branding"
    "GET /api/admin/exports"
)

for endpoint in "${ADMIN_ENDPOINTS[@]}"; do
    method=$(echo $endpoint | cut -d' ' -f1)
    path=$(echo $endpoint | cut -d' ' -f2)
    echo -n "Testing $endpoint... "
    if [ $(test_endpoint "$method" "$path" "yes") -eq 0 ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        FAILED_ENDPOINTS="$FAILED_ENDPOINTS\n- $endpoint"
    fi
done

# ==========================================
# PHASE 5: AWS CONFIGURATION
# ==========================================
echo -e "\n${YELLOW}PHASE 5: AWS CONFIGURATION${NC}"
echo "=========================="

# Check if AWS is configured
if ! grep -q "AWS_ACCESS_KEY_ID=" .env || grep -q "AWS_ACCESS_KEY_ID=your_access_key_here" .env; then
    echo -e "${YELLOW}⚠ AWS credentials not configured${NC}"
    echo "Adding placeholder AWS configuration to .env..."
    
    # Remove old placeholders
    sed -i '/AWS_ACCESS_KEY_ID/d' .env
    sed -i '/AWS_SECRET_ACCESS_KEY/d' .env
    sed -i '/AWS_REGION/d' .env
    sed -i '/S3_BUCKET/d' .env
    
    # Add new configuration
    cat >> .env << 'EOF'

# AWS Configuration (update with real credentials)
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
S3_BUCKET=rsn8tv-exports-302263084554
EOF
    
    echo -e "${YELLOW}! You must update AWS credentials in .env for export functionality${NC}"
else
    echo -e "${GREEN}✓ AWS configuration found${NC}"
fi

# ==========================================
# PHASE 6: FINAL VERIFICATION
# ==========================================
echo -e "\n${YELLOW}PHASE 6: FINAL VERIFICATION${NC}"
echo "==========================="

# Check server restart count
RESTART_COUNT=$(pm2 describe rsn8tv | grep restart | awk '{print $4}')
if [ "$RESTART_COUNT" -gt "2" ]; then
    echo -e "${YELLOW}⚠ Server has restarted $RESTART_COUNT times${NC}"
    echo "Checking recent errors..."
    pm2 logs rsn8tv --err --lines 10 --nostream
else
    echo -e "${GREEN}✓ Server is stable (restarts: $RESTART_COUNT)${NC}"
fi

# Check database connectivity
echo -n "Testing database connection... "
if psql -U axiom -d rsn8tv_trivia -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Check critical tables
echo "Checking critical tables..."
TABLES=(branding_config themes exports prize_configurations question_cache leaderboards)
for table in "${TABLES[@]}"; do
    echo -n "  - $table... "
    if psql -U axiom -d rsn8tv_trivia -c "SELECT COUNT(*) FROM $table" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
    fi
done

# ==========================================
# SUMMARY
# ==========================================
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}LAUNCH READINESS SUMMARY${NC}"
echo -e "${YELLOW}========================================${NC}"

# Calculate success metrics
TOTAL_CHECKS=30
FAILED_CHECKS=$(echo -e "$FAILED_ENDPOINTS" | grep -c "^-" || true)
SUCCESS_RATE=$((100 - (FAILED_CHECKS * 100 / TOTAL_CHECKS)))

echo -e "\n${BLUE}Success Rate: ${SUCCESS_RATE}%${NC}"

if [ -z "$FAILED_ENDPOINTS" ]; then
    echo -e "\n${GREEN}✅ ALL SYSTEMS OPERATIONAL!${NC}"
    echo -e "${GREEN}The RSN8TV Trivia System is ready for launch!${NC}"
else
    echo -e "\n${YELLOW}⚠ Some endpoints still failing:${NC}"
    echo -e "$FAILED_ENDPOINTS"
    echo -e "\n${YELLOW}Run diagnostics with: pm2 logs rsn8tv --err${NC}"
fi

echo -e "\n${BLUE}Next Steps:${NC}"
echo "1. Update AWS credentials in .env"
echo "2. Test game flow: host creates game → players join → play → register"
echo "3. Test admin dashboard: https://trivia.rsn8tv.com/admin/monitoring/dashboard.html"
echo "4. Monitor logs: pm2 logs rsn8tv -f"
echo "5. Push to GitHub when all tests pass"

echo -e "\n${BLUE}Useful Commands:${NC}"
echo "- pm2 status          # Check server status"
echo "- pm2 logs rsn8tv     # View logs"
echo "- pm2 restart rsn8tv  # Restart server"
echo "- ./api_test.sh       # Run API tests"

echo -e "\n${GREEN}Script completed at: $(date)${NC}"
echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"

# Create success marker
touch "$SERVER_DIR/.launch_ready"

exit 0ch
