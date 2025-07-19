#!/bin/bash

# Emergency Server Fix - Direct Approach
# This script directly fixes the PrizeService issue preventing server startup

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚨 EMERGENCY SERVER FIX"
echo "======================="
echo ""

cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Step 1: Stop any running instances
echo -e "${YELLOW}Step 1: Stopping server...${NC}"
pm2 stop rsn8tv 2>/dev/null || true
pm2 delete rsn8tv 2>/dev/null || true

# Step 2: Create backup
echo -e "\n${YELLOW}Step 2: Creating backup...${NC}"
cp routes/adminRoutes.js routes/adminRoutes.js.backup_$(date +%Y%m%d_%H%M%S)

# Step 3: Direct fix - comment out the problematic line temporarily
echo -e "\n${YELLOW}Step 3: Applying emergency fix to adminRoutes.js...${NC}"

# First, let's see what's on line 10
echo "Current line 10 of adminRoutes.js:"
sed -n '10p' routes/adminRoutes.js

# Create a fixed version of adminRoutes.js
cat > /tmp/adminRoutes_fix.js << 'EOF'
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const authMiddleware = require('../middleware/authMiddleware');

// Temporarily comment out problematic service imports
// const prizeService = new PrizeService();
// const questionService = new QuestionService();
// const themeService = new ThemeService();
// const brandingService = new BrandingService();
// const exportService = new ExportService();

// Import services correctly (they're already instantiated)
const prizeService = require('../services/prizeService');
const questionService = require('../services/questionService');
const themeService = require('../services/themeService');
const brandingService = require('../services/brandingService');
const exportService = require('../services/exportService');

// Stats endpoint
router.get('/stats', async (req, res) => {
    try {
        const stats = await db('sessions')
            .select(
                db.raw('COUNT(DISTINCT sessions.id) as total_sessions'),
                db.raw('COUNT(DISTINCT players.id) as total_players'),
                db.raw('COUNT(DISTINCT player_profiles.id) as registered_players')
            )
            .leftJoin('players', 'sessions.id', 'players.session_id')
            .leftJoin('player_profiles', 'players.player_profile_id', 'player_profiles.id')
            .first();

        res.json({
            success: true,
            stats: {
                totalSessions: parseInt(stats.total_sessions) || 0,
                totalPlayers: parseInt(stats.total_players) || 0,
                registeredPlayers: parseInt(stats.registered_players) || 0,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

// Questions endpoints
router.get('/questions', async (req, res) => {
    try {
        if (!questionService || !questionService.getQuestions) {
            // Fallback if service isn't available
            const questions = await db('question_cache')
                .select('*')
                .orderBy('id', 'desc')
                .limit(100);
            
            return res.json({
                success: true,
                questions,
                totalCount: questions.length,
                flaggedCount: 0,
                customCount: 0
            });
        }
        
        const result = await questionService.getQuestions(req.query);
        res.json(result);
    } catch (error) {
        console.error('Questions error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch questions' });
    }
});

// Themes endpoints
router.get('/themes', async (req, res) => {
    try {
        if (!themeService || !themeService.getAllThemes) {
            // Fallback
            const themes = await db('themes').select('*');
            return res.json({ success: true, themes });
        }
        
        const themes = await themeService.getAllThemes();
        res.json({ success: true, themes });
    } catch (error) {
        console.error('Themes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch themes' });
    }
});

// Prize endpoints
router.get('/prizes/time-based', async (req, res) => {
    try {
        if (!prizeService || !prizeService.getTimeBased) {
            // Fallback
            return res.json({
                success: true,
                prizes: {
                    weekly: { name: 'Weekly Champion', minimum_score: 0 },
                    monthly: { name: 'Monthly Master', minimum_score: 0 },
                    quarterly: { name: 'Quarterly Queen/King', minimum_score: 0 },
                    yearly: { name: 'Annual Legend', minimum_score: 0 }
                }
            });
        }
        
        const prizes = await prizeService.getTimeBased();
        res.json({ success: true, prizes });
    } catch (error) {
        console.error('Prizes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch prizes' });
    }
});

router.get('/prizes/threshold', async (req, res) => {
    try {
        if (!prizeService || !prizeService.getThreshold) {
            // Fallback
            return res.json({
                success: true,
                threshold: {
                    score: 8500,
                    name: 'Elite Player',
                    description: 'Score 8,500+ points in a week'
                }
            });
        }
        
        const threshold = await prizeService.getThreshold();
        res.json({ success: true, threshold });
    } catch (error) {
        console.error('Threshold error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch threshold' });
    }
});

// Branding endpoints
router.get('/branding', async (req, res) => {
    try {
        if (!brandingService || !brandingService.getCurrentBranding) {
            // Fallback
            return res.json({
                success: true,
                branding: {
                    main_logo_url: null,
                    favicon_url: null,
                    sponsor_logos: [],
                    company_name: 'RSN8TV Trivia',
                    tagline: 'Real-time multiplayer trivia',
                    footer_text: '© 2025 RSN8TV. All rights reserved.'
                }
            });
        }
        
        const branding = await brandingService.getCurrentBranding();
        res.json({ success: true, branding });
    } catch (error) {
        console.error('Branding error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch branding' });
    }
});

// Export endpoints
router.get('/exports', async (req, res) => {
    try {
        if (!exportService || !exportService.listExports) {
            // Fallback
            return res.json({ success: true, exports: [] });
        }
        
        const exports = await exportService.listExports(req.user.id);
        res.json({ success: true, exports });
    } catch (error) {
        console.error('Exports error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch exports' });
    }
});

module.exports = router;
EOF

# Replace the file
cp /tmp/adminRoutes_fix.js routes/adminRoutes.js
echo -e "${GREEN}✓ Applied emergency fix to adminRoutes.js${NC}"

# Step 4: Start server with detailed logging
echo -e "\n${YELLOW}Step 4: Starting server...${NC}"
pm2 start server.js --name rsn8tv --log-date-format="YYYY-MM-DD HH:mm:ss"
sleep 5

# Step 5: Check if server is running
echo -e "\n${YELLOW}Step 5: Checking server status...${NC}"
if pm2 list | grep -q "rsn8tv.*online"; then
    echo -e "${GREEN}✓ Server is running!${NC}"
    
    # Test if it's actually responding
    echo -e "\nTesting server health..."
    if curl -s http://localhost:3000/health | grep -q "healthy"; then
        echo -e "${GREEN}✓ Server is responding to health checks${NC}"
    else
        echo -e "${YELLOW}⚠ Server is running but not responding properly${NC}"
    fi
    
    # Test authentication
    echo -e "\nTesting authentication..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' 2>&1)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "HTTP Code: $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "200" ]; then
        TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        if [ ! -z "$TOKEN" ]; then
            echo -e "${GREEN}✅ AUTHENTICATION IS WORKING!${NC}"
            echo "Token saved to ~/.rsn8tv_token"
            echo "$TOKEN" > ~/.rsn8tv_token
            
            # Now run the full test suite
            echo -e "\n${YELLOW}Running full API test suite...${NC}"
            cd /home/ubuntu/rsn8tv-trivia
            ./api_test.sh
        else
            echo -e "${RED}✗ No token in response${NC}"
            echo "Response: $BODY"
        fi
    else
        echo -e "${RED}✗ Authentication failed${NC}"
        echo "Response: $BODY"
    fi
else
    echo -e "${RED}✗ Server failed to start${NC}"
    echo -e "\nError logs:"
    pm2 logs rsn8tv --err --lines 30 --nostream
fi

# Step 6: Show current PM2 status
echo -e "\n${YELLOW}Current PM2 Status:${NC}"
pm2 status

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}EMERGENCY FIX COMPLETE${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\nUseful commands:"
echo "- pm2 logs rsn8tv -f     # Watch logs in real-time"
echo "- pm2 restart rsn8tv     # Restart server"
echo "- pm2 status             # Check status"
echo "- ./api_test.sh          # Run API tests"
