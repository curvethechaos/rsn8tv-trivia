#!/bin/bash

# RSN8TV Backend Fix Script
# This script fixes all remaining backend issues

set -e  # Exit on error

echo "🔧 RSN8TV Backend Fix Script"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="/home/ubuntu/rsn8tv-trivia/trivia-server"
cd $BASE_DIR

echo -e "${YELLOW}Step 1: Backing up current files...${NC}"
mkdir -p backups/$(date +%Y%m%d_%H%M%S)
cp services/prizeService.js backups/$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
cp services/questionService.js backups/$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
cp routes/adminRoutes.js backups/$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
echo -e "${GREEN}✓ Backups created${NC}"

echo -e "\n${YELLOW}Step 2: Fixing prizeService.js...${NC}"
# Fix the rank column issue in getPrizeWinners
sed -i 's/l\.rank\b/l.rank_position/g' services/prizeService.js
echo -e "${GREEN}✓ Fixed rank_position references${NC}"

echo -e "\n${YELLOW}Step 3: Adding missing methods to questionService.js...${NC}"
# Check if getQuestions method exists
if ! grep -q "async getQuestions" services/questionService.js; then
    # Add getQuestions method before the closing brace
    cat >> services/questionService.js << 'EOF'

  async getQuestions({ page = 1, limit = 50, difficulty, category, search, status }) {
    let query = db('question_cache')
      .select(
        'id',
        'question_text as question',
        'correct_answer',
        'incorrect_answers',
        'category',
        'difficulty',
        'times_used',
        db.raw('CASE WHEN times_attempted > 0 THEN ROUND((times_correct::DECIMAL / times_attempted) * 100) ELSE 0 END as success_rate'),
        'is_flagged',
        'is_custom'
      );

    // Apply filters
    if (difficulty && difficulty !== 'all') {
      query = query.where('difficulty', difficulty);
    }

    if (category && category !== 'all') {
      query = query.where('category', category);
    }

    if (search) {
      query = query.where('question_text', 'ilike', `%${search}%`);
    }

    if (status === 'flagged') {
      query = query.where('is_flagged', true);
    } else if (status === 'active') {
      query = query.where('is_active', true);
    } else if (status === 'custom') {
      query = query.where('is_custom', true);
    }

    // Get counts
    const [totalResult] = await db('question_cache').count('* as count');
    const [flaggedResult] = await db('question_cache').where('is_flagged', true).count('* as count');
    const [customResult] = await db('question_cache').where('is_custom', true).count('* as count');

    // Paginate
    const offset = (page - 1) * limit;
    const questions = await query
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset);

    // Parse incorrect_answers if stored as JSON string
    const parsedQuestions = questions.map(q => ({
      ...q,
      incorrect_answers: typeof q.incorrect_answers === 'string' 
        ? JSON.parse(q.incorrect_answers) 
        : q.incorrect_answers
    }));

    return {
      questions: parsedQuestions,
      totalCount: parseInt(totalResult.count),
      flaggedCount: parseInt(flaggedResult.count),
      customCount: parseInt(customResult.count)
    };
  }

  async getCategories() {
    const categories = await db('question_cache')
      .distinct('category')
      .whereNotNull('category')
      .orderBy('category');
    
    return categories.map(c => c.category);
  }
EOF
    # Remove the last closing brace and re-add it
    sed -i '$ d' services/questionService.js
    echo "}" >> services/questionService.js
    echo -e "${GREEN}✓ Added getQuestions and getCategories methods${NC}"
else
    echo -e "${GREEN}✓ getQuestions method already exists${NC}"
fi

echo -e "\n${YELLOW}Step 4: Fixing CSV template route in adminRoutes.js...${NC}"
# Check if the template route exists correctly
if ! grep -q "router.get('/questions/template'" routes/adminRoutes.js; then
    # Find where to insert (after questions/categories route)
    sed -i "/router.get('\/questions\/categories'/a\\
\\
// CSV Template route\\
router.get('/questions/template', authMiddleware, (req, res) => {\\
  const csv = \`question,correct_answer,incorrect_answer_1,incorrect_answer_2,incorrect_answer_3,category,difficulty\\
\"What is the capital of France?\",\"Paris\",\"London\",\"Berlin\",\"Madrid\",\"Geography\",\"easy\"\\
\"Who painted the Mona Lisa?\",\"Leonardo da Vinci\",\"Pablo Picasso\",\"Vincent van Gogh\",\"Michelangelo\",\"Art\",\"medium\"\`;\\
  \\
  res.setHeader('Content-Type', 'text/csv');\\
  res.setHeader('Content-Disposition', 'attachment; filename=\"questions_template.csv\"');\\
  res.send(csv);\\
});" routes/adminRoutes.js
    echo -e "${GREEN}✓ Added CSV template route${NC}"
else
    echo -e "${GREEN}✓ CSV template route already exists${NC}"
fi

echo -e "\n${YELLOW}Step 5: Updating database schema...${NC}"
# Create SQL file for database updates
cat > /tmp/fix_questions_table.sql << 'EOF'
-- Add missing columns to question_cache table
ALTER TABLE question_cache 
ADD COLUMN IF NOT EXISTS times_attempted INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS times_correct INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update any null values
UPDATE question_cache SET times_attempted = 0 WHERE times_attempted IS NULL;
UPDATE question_cache SET times_correct = 0 WHERE times_correct IS NULL;
UPDATE question_cache SET is_custom = false WHERE is_custom IS NULL;
UPDATE question_cache SET is_flagged = false WHERE is_flagged IS NULL;
UPDATE question_cache SET is_active = true WHERE is_active IS NULL;
EOF

# Execute SQL
PGPASSWORD=HirschF843 psql -U axiom -d rsn8tv_trivia -f /tmp/fix_questions_table.sql
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database schema updated${NC}"
else
    echo -e "${RED}✗ Database update failed - manual intervention may be required${NC}"
fi

# Clean up
rm -f /tmp/fix_questions_table.sql

echo -e "\n${YELLOW}Step 6: Fixing module exports in questionService.js...${NC}"
# Ensure the service is properly exported
if ! grep -q "module.exports = QuestionService" services/questionService.js; then
    if grep -q "module.exports = new QuestionService" services/questionService.js; then
        echo -e "${GREEN}✓ Module export already correct${NC}"
    else
        echo "module.exports = new QuestionService();" >> services/questionService.js
        echo -e "${GREEN}✓ Fixed module export${NC}"
    fi
fi

echo -e "\n${YELLOW}Step 7: Restarting the server...${NC}"
pm2 restart rsn8tv

# Wait for server to start
sleep 3

echo -e "\n${YELLOW}Step 8: Checking server status...${NC}"
pm2 status rsn8tv

echo -e "\n${YELLOW}Step 9: Running API tests...${NC}"
cd /home/ubuntu/rsn8tv-trivia
if [ -f "./api_test.sh" ]; then
    echo "Running API tests in 5 seconds..."
    sleep 5
    ./api_test.sh
else
    echo -e "${YELLOW}API test script not found, checking logs instead...${NC}"
    pm2 logs rsn8tv --lines 20 --nostream
fi

echo -e "\n${GREEN}✅ Backend fixes completed!${NC}"
echo -e "${YELLOW}Summary of changes:${NC}"
echo "- Fixed rank_position column references in prizeService.js"
echo "- Added getQuestions and getCategories methods to questionService.js"
echo "- Added CSV template route to adminRoutes.js"
echo "- Updated database schema with missing columns"
echo "- Restarted the server"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Check the API test results above"
echo "2. Update frontend tab JavaScript files to use correct module pattern"
echo "3. Test the admin dashboard in your browser"
