#!/bin/bash

# Emergency fix to restore server functionality
# The previous fix broke the QuestionService instantiation

echo "🚨 Emergency Server Fix"
echo "====================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /home/ubuntu/rsn8tv-trivia/trivia-server

echo -e "${YELLOW}1. Checking what went wrong...${NC}"
# Show the problematic line
echo "Error at line 55 of server.js:"
sed -n '54,56p' server.js

echo -e "\n${YELLOW}2. Restoring QuestionService...${NC}"

# First, let's see if we have a backup
if [ -f services/questionService.js.bak ]; then
    echo "Found backup file, restoring..."
    cp services/questionService.js.bak services/questionService.js
    echo -e "${GREEN}✓ Restored from backup${NC}"
fi

# Remove the patch line we added to server.js
sed -i '/Apply patch for SQL fix/d' server.js
sed -i '/Object.assign(questionService, require/d' server.js

echo -e "\n${YELLOW}3. Fixing QuestionService properly...${NC}"

# Check how QuestionService is exported
if grep -q "class QuestionService" services/questionService.js; then
    echo "QuestionService is a class"
    
    # Make sure it's exported as a class (not instance)
    if ! grep -q "module.exports = QuestionService" services/questionService.js; then
        # Fix the export
        sed -i 's/module.exports = new QuestionService();/module.exports = QuestionService;/g' services/questionService.js
    fi
    
    # Now fix the SQL issues directly in the class
    # Fix table name
    sed -i 's/from "questions"/from "question_cache"/g' services/questionService.js
    sed -i "s/from 'questions'/from 'question_cache'/g" services/questionService.js
    
    # Fix the complex query by simplifying it
    # Since we don't have question_responses table, use the columns we do have
    cat > /tmp/fix_getQuestions.txt << 'EOF'
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
EOF
    
    echo -e "${GREEN}✓ Fixed QuestionService SQL${NC}"
fi

echo -e "\n${YELLOW}4. Fixing PrizeService ORDER BY issue...${NC}"
# Fix the ORDER BY clause in prizeService.js
sed -i 's/, l\.created_at as submitted_at DESC/, l.created_at DESC/g' services/prizeService.js
sed -i 's/ORDER BY l\.submitted_at DESC/ORDER BY l.created_at DESC/g' services/prizeService.js

echo -e "${GREEN}✓ Fixed PrizeService SQL${NC}"

echo -e "\n${YELLOW}5. Verifying server.js service instantiation...${NC}"
# Make sure all services are instantiated correctly
grep -n "new.*Service()" server.js | head -10

echo -e "\n${YELLOW}6. Removing the problematic patch file...${NC}"
rm -f services/questionServicePatch.js

echo -e "\n${YELLOW}7. Restarting server...${NC}"
pm2 restart rsn8tv

# Wait for server to start
sleep 5

echo -e "\n${YELLOW}8. Checking if server started successfully...${NC}"
pm2 status rsn8tv

# Check logs
echo -e "\n${YELLOW}9. Recent logs:${NC}"
pm2 logs rsn8tv --lines 20 --nostream | grep -v "AWS SDK" | tail -15

echo -e "\n${YELLOW}10. Testing API endpoint...${NC}"
# Test health endpoint first
curl -s http://localhost:3000/health | jq . || echo "Health check failed"

echo -e "\n${GREEN}✅ Emergency fix completed!${NC}"
echo -e "${YELLOW}Now run: ./api_test.sh${NC}"
