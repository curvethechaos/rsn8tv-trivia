#!/bin/bash

# RSN8TV Diagnostic Script
# Identifies exact errors for failing endpoints

echo "🔍 RSN8TV Backend Diagnostics"
echo "============================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get the auth token
if [ -f ~/.rsn8tv_token ]; then
    TOKEN=$(cat ~/.rsn8tv_token)
else
    echo "Getting auth token..."
    TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | \
        grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo $TOKEN > ~/.rsn8tv_token
fi

echo -e "${YELLOW}1. Testing Branding Endpoint with Verbose Logging${NC}"
echo "================================================="

# First, let's check if the brandingService file has AWS dependencies
echo -e "${BLUE}Checking brandingService.js for issues...${NC}"
cd /home/ubuntu/rsn8tv-trivia/trivia-server

# Look for AWS usage
if grep -q "require('aws-sdk')" services/brandingService.js; then
    echo -e "${YELLOW}⚠ BrandingService uses AWS SDK${NC}"
    
    # Check if AWS SDK is installed
    if ! npm list aws-sdk &>/dev/null; then
        echo -e "${RED}✗ AWS SDK not installed!${NC}"
        echo "Installing aws-sdk..."
        npm install aws-sdk
    else
        echo -e "${GREEN}✓ AWS SDK is installed${NC}"
    fi
    
    # Check for AWS credentials in .env
    if ! grep -q "AWS_ACCESS_KEY_ID" .env; then
        echo -e "${YELLOW}⚠ AWS credentials not configured in .env${NC}"
        echo "Adding placeholder AWS config to .env..."
        echo "" >> .env
        echo "# AWS Configuration (update with real values)" >> .env
        echo "AWS_ACCESS_KEY_ID=your_access_key_here" >> .env
        echo "AWS_SECRET_ACCESS_KEY=your_secret_key_here" >> .env
        echo "AWS_REGION=us-east-1" >> .env
        echo "S3_BUCKET=rsn8tv-branding" >> .env
    fi
fi

# Check if sharp is required but not installed
if grep -q "require('sharp')" services/brandingService.js && ! npm list sharp &>/dev/null; then
    echo -e "${RED}✗ Sharp image processing library not installed!${NC}"
    echo "Installing sharp..."
    npm install sharp
fi

echo -e "\n${YELLOW}2. Creating Test Script for Direct Service Testing${NC}"
echo "=================================================="

# Create a test script to directly test services
cat > test_services.js << 'EOF'
// Direct service testing
require('dotenv').config();
const db = require('./db/connection');

async function testBrandingService() {
    console.log('\n=== Testing BrandingService ===');
    try {
        const BrandingService = require('./services/brandingService');
        console.log('BrandingService loaded:', typeof BrandingService);
        
        // Check if it's a class or instance
        let service;
        if (typeof BrandingService === 'function') {
            service = new BrandingService();
        } else {
            service = BrandingService;
        }
        
        console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(m => m !== 'constructor'));
        
        if (service.getCurrentBranding) {
            const result = await service.getCurrentBranding();
            console.log('✓ getCurrentBranding succeeded:', JSON.stringify(result).substring(0, 100));
        } else {
            console.log('✗ getCurrentBranding method not found');
        }
    } catch (error) {
        console.error('✗ BrandingService error:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function testQuestionService() {
    console.log('\n=== Testing QuestionService ===');
    try {
        const QuestionService = require('./services/questionService');
        console.log('QuestionService loaded:', typeof QuestionService);
        
        let service;
        if (typeof QuestionService === 'function') {
            service = new QuestionService();
        } else {
            service = QuestionService;
        }
        
        console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(m => m !== 'constructor'));
        
        if (service.getQuestions) {
            const result = await service.getQuestions({ page: 1, limit: 5 });
            console.log('✓ getQuestions succeeded. Total:', result.totalCount);
        } else {
            console.log('✗ getQuestions method not found');
        }
    } catch (error) {
        console.error('✗ QuestionService error:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function testPrizeService() {
    console.log('\n=== Testing PrizeService ===');
    try {
        const PrizeService = require('./services/prizeService');
        console.log('PrizeService loaded:', typeof PrizeService);
        
        let service;
        if (typeof PrizeService === 'function') {
            service = new PrizeService();
        } else {
            service = PrizeService;
        }
        
        console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(m => m !== 'constructor'));
        
        if (service.getPrizeWinners) {
            const result = await service.getPrizeWinners('weekly', 'time-based');
            console.log('✓ getPrizeWinners succeeded. Count:', result.length);
        } else {
            console.log('✗ getPrizeWinners method not found');
        }
    } catch (error) {
        console.error('✗ PrizeService error:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function checkDatabaseTables() {
    console.log('\n=== Checking Database Tables ===');
    try {
        // Check branding_config
        const brandingExists = await db.schema.hasTable('branding_config');
        console.log(`branding_config table exists: ${brandingExists}`);
        
        // Check question_cache columns
        const questionColumns = await db('question_cache').columnInfo();
        console.log('question_cache columns:', Object.keys(questionColumns).join(', '));
        
        // Check leaderboards columns
        const leaderboardColumns = await db('leaderboards').columnInfo();
        console.log('leaderboards columns:', Object.keys(leaderboardColumns).join(', '));
        
        // Test a sample query
        const sampleQuestion = await db('question_cache').first();
        console.log('Sample question keys:', sampleQuestion ? Object.keys(sampleQuestion) : 'No questions found');
        
    } catch (error) {
        console.error('Database check error:', error.message);
    }
}

// Run all tests
async function runTests() {
    await checkDatabaseTables();
    await testBrandingService();
    await testQuestionService();
    await testPrizeService();
    process.exit(0);
}

runTests().catch(console.error);
EOF

echo -e "${GREEN}✓ Test script created${NC}"

echo -e "\n${YELLOW}3. Running Direct Service Tests${NC}"
echo "================================"
node test_services.js

echo -e "\n${YELLOW}4. Checking Recent Error Logs${NC}"
echo "============================="
pm2 logs rsn8tv --lines 50 --nostream | grep -E "(Error|error:|TypeError|ReferenceError)" | tail -20

echo -e "\n${YELLOW}5. Quick Fixes Based on Common Issues${NC}"
echo "===================================="

# Fix missing dependencies
echo "Checking for missing dependencies..."
cd /home/ubuntu/rsn8tv-trivia/trivia-server
MISSING_DEPS=""

# Check each potentially missing dependency
for dep in "aws-sdk" "sharp" "uuid" "csv-parse"; do
    if ! npm list $dep &>/dev/null; then
        MISSING_DEPS="$MISSING_DEPS $dep"
    fi
done

if [ ! -z "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}Installing missing dependencies:$MISSING_DEPS${NC}"
    npm install $MISSING_DEPS
    pm2 restart rsn8tv
else
    echo -e "${GREEN}✓ All expected dependencies are installed${NC}"
fi

# Clean up
rm -f test_services.js

echo -e "\n${GREEN}Diagnostics complete!${NC}"
echo -e "${YELLOW}Based on the output above, we can identify and fix the specific issues.${NC}"
